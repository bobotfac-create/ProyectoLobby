"""Crea paquetes ZIP reproducibles para la revision y firma en cada tienda."""
import argparse
import json
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parent


def build(output):
    chrome = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    chrome_copy = json.loads((ROOT / "manifest.chrome.json").read_text(encoding="utf-8"))
    firefox = json.loads((ROOT / "manifest.firefox.json").read_text(encoding="utf-8"))
    firefox_common = {key: value for key, value in firefox.items() if key not in ("background", "browser_specific_settings")}
    chrome_common = {key: value for key, value in chrome.items() if key != "background"}
    if chrome != chrome_copy or firefox_common != chrome_common:
        raise ValueError("Los manifiestos comunes no coinciden; revisa las diferencias antes de empaquetar.")
    files = sorted((ROOT / "src").rglob("*"))
    if any(path.is_symlink() for path in files):
        raise ValueError("No se permiten enlaces simbolicos en src/.")
    files = [path for path in files if path.is_file()]
    paths = {path.relative_to(ROOT).as_posix() for path in files}
    for manifest in (chrome, firefox):
        referenced = list(manifest["background"].get("scripts", []))
        if manifest["background"].get("service_worker"):
            referenced.append(manifest["background"]["service_worker"])
        referenced += [path for entry in manifest["content_scripts"] for path in entry["js"]]
        referenced += [path for entry in manifest["web_accessible_resources"] for path in entry["resources"]]
        if not set(referenced) <= paths:
            raise ValueError("Faltan archivos referenciados por un manifiesto.")
    output = Path(output)
    output.mkdir(parents=True, exist_ok=True)
    targets = [output / "asistente-lobby-chrome.zip", output / "asistente-lobby-firefox.zip"]
    if any(path.exists() for path in targets):
        raise FileExistsError("Ya existe un paquete de destino; usa otro directorio.")
    for target, manifest in zip(targets, (chrome, firefox)):
        with zipfile.ZipFile(target, "x", compression=zipfile.ZIP_STORED) as archive:
            entries = [("manifest.json", (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8"))]
            entries += [(path.relative_to(ROOT).as_posix(), path.read_bytes()) for path in files]
            for name, data in entries:
                info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
                info.external_attr = 0o100644 << 16
                archive.writestr(info, data)
    return targets


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", default=str(ROOT / "dist"), help="Directorio para los paquetes nuevos")
    args = parser.parse_args()
    for package in build(args.output):
        print(package)
