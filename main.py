from playwright.sync_api import sync_playwright


URL = "https://www.leylobby.gob.cl/solicitud/audiencia"


def main() -> None:
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        page = browser.new_page()
        page.goto(URL, wait_until="domcontentloaded")

        print("Pagina abierta. Presiona Enter para cerrar el navegador.")
        input()

        browser.close()


if __name__ == "__main__":
    main()
