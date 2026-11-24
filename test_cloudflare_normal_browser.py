import argparse
import shutil
import time
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import Error as PlaywrightError
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


START_URL = "https://www.leylobby.gob.cl/solicitud/audiencia"
DEFAULT_PROFILE_DIR = Path("browser-profile-lobby")
DEFAULT_TIMEOUT_SECONDS = 600

BROWSER_CANDIDATES = {
    "chromium": ["chromium", "chromium-browser"],
    "brave": ["brave-browser", "brave"],
}


def find_browser(preferred: str | None) -> tuple[str, str]:
    candidates: list[tuple[str, str]] = []

    if preferred:
        if preferred not in BROWSER_CANDIDATES:
            raise ValueError(f"Navegador no soportado: {preferred}")
        candidates.extend((preferred, command) for command in BROWSER_CANDIDATES[preferred])
    else:
        for browser_name, commands in BROWSER_CANDIDATES.items():
            candidates.extend((browser_name, command) for command in commands)

    for browser_name, command in candidates:
        executable = shutil.which(command)
        if executable:
            return browser_name, executable

    names = ", ".join(command for commands in BROWSER_CANDIDATES.values() for command in commands)
    raise RuntimeError(f"No encontre ningun navegador disponible. Busque: {names}")


def visible_url(url: str) -> str:
    parsed = urlparse(url)
    path = parsed.path or "/"
    query = "?" if parsed.query else ""
    return f"{parsed.netloc}{path}{query}"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Prueba Cloudflare Turnstile usando Chromium/Brave normal con perfil persistente."
    )
    parser.add_argument(
        "--browser",
        choices=sorted(BROWSER_CANDIDATES),
        help="Navegador a usar. Si no se indica, prueba Chromium y luego Brave.",
    )
    parser.add_argument(
        "--profile-dir",
        default=str(DEFAULT_PROFILE_DIR),
        help="Directorio del perfil persistente dedicado.",
    )
    parser.add_argument(
        "--timeout",
        type=int,
        default=DEFAULT_TIMEOUT_SECONDS,
        help="Segundos maximos para esperar formulario/captcha.",
    )
    args = parser.parse_args()

    browser_name, executable_path = find_browser(args.browser)
    profile_dir = Path(args.profile_dir).resolve()
    profile_dir.mkdir(parents=True, exist_ok=True)

    print(f"Navegador: {browser_name}")
    print(f"Ejecutable: {executable_path}")
    print(f"Perfil dedicado: {profile_dir}")
    print(f"URL inicial: {START_URL}")
    print()

    responses: list[dict[str, object]] = []
    failed: list[dict[str, object]] = []
    redirects: list[tuple[str, str]] = []

    with sync_playwright() as p:
        context = p.chromium.launch_persistent_context(
            user_data_dir=str(profile_dir),
            executable_path=executable_path,
            headless=False,
            viewport={"width": 1366, "height": 900},
            args=["--start-maximized"],
        )
        page = context.pages[0] if context.pages else context.new_page()

        def on_request(request) -> None:
            if request.redirected_from:
                redirects.append((request.redirected_from.url, request.url))

        def on_response(response) -> None:
            request = response.request
            responses.append(
                {
                    "method": request.method,
                    "status": response.status,
                    "resource_type": request.resource_type,
                    "url": response.url,
                    "domain": urlparse(response.url).netloc,
                }
            )

        def on_request_failed(request) -> None:
            failed.append(
                {
                    "method": request.method,
                    "resource_type": request.resource_type,
                    "url": request.url,
                    "failure": request.failure,
                    "domain": urlparse(request.url).netloc,
                }
            )

        page.on("request", on_request)
        page.on("response", on_response)
        page.on("requestfailed", on_request_failed)

        try:
            page.goto(START_URL, wait_until="domcontentloaded", timeout=45_000)
        except PlaywrightTimeoutError:
            print("La navegacion inicial excedio el tiempo de espera, pero la ventana sigue abierta.")

        print("Pagina abierta.")
        print("Selecciona manualmente la institucion desde el navegador.")
        print("Cuando llegues al formulario, resuelve Turnstile si aparece.")
        print("El script esperara hasta detectar el formulario y luego el token de captcha.")
        print()

        deadline = time.monotonic() + args.timeout
        form_seen = False
        turnstile_seen = False
        token_seen = False
        last_reported_url = ""

        while time.monotonic() < deadline:
            try:
                current_url = page.url
                if current_url != last_reported_url:
                    last_reported_url = current_url
                    print(f"URL actual: {current_url}")

                if not form_seen and page.locator("#SolicitudesAudienciaForm").count() > 0:
                    form_seen = True
                    print("Formulario detectado: #SolicitudesAudienciaForm")

                if not turnstile_seen and page.locator(".cf-turnstile").count() > 0:
                    turnstile_seen = True
                    print("Turnstile detectado: .cf-turnstile")

                token_seen = bool(
                    page.evaluate(
                        """
                        () => {
                            const hiddenToken = document.querySelector('#lobby-captcha-token')?.value;
                            const windowToken = window.__lobbyCaptchaToken;
                            return Boolean(hiddenToken || windowToken);
                        }
                        """
                    )
                )
                if token_seen:
                    print("Token de Turnstile detectado. La resolucion manual funciono en este navegador.")
                    break
            except PlaywrightError as exc:
                print(f"La pagina o el navegador se cerro durante la prueba: {exc}")
                break

            time.sleep(1)

        if not token_seen:
            print("No se detecto token de Turnstile dentro del tiempo de espera.")

        print()
        print("Resumen")
        print(f"URL final: {page.url if not page.is_closed() else '[pagina cerrada]'}")
        print(f"Formulario detectado: {form_seen}")
        print(f"Turnstile detectado: {turnstile_seen}")
        print(f"Token detectado: {token_seen}")
        print(f"Responses capturadas: {len(responses)}")
        print(f"Requests fallidos: {len(failed)}")

        non_2xx = [record for record in responses if int(record["status"]) < 200 or int(record["status"]) >= 300]
        if redirects:
            print()
            print("Redirects")
            for old_url, new_url in redirects:
                print(f"  {visible_url(old_url)} -> {visible_url(new_url)}")

        if non_2xx:
            print()
            print("Responses no 2xx")
            for record in non_2xx:
                print(
                    f"  {record['method']} {record['status']} "
                    f"{record['resource_type']} {record['url']}"
                )

        if failed:
            print()
            print("Requests fallidos")
            for record in failed:
                print(
                    f"  {record['method']} {record['resource_type']} "
                    f"{record['failure']} {record['url']}"
                )

        print()
        input("Presiona Enter para cerrar el navegador...")
        context.close()


if __name__ == "__main__":
    main()
