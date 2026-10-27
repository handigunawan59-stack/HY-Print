"""Copy license and notice files shipped with the bundled Python packages."""
from importlib import metadata
from pathlib import Path
import shutil
import sys

destination = Path(sys.argv[1])
for name in ("PyMuPDF", "PySide6-Essentials", "shiboken6", "Pillow", "pywin32", "pyinstaller"):
    dist = metadata.distribution(name)
    target = destination / name
    target.mkdir(parents=True, exist_ok=True)
    found = []
    for file in dist.files or ():
        basename = Path(file).name.lower()
        if basename.startswith(("license", "licence", "copying", "notice")):
            source = Path(dist.locate_file(file))
            if source.is_file():
                rel = Path(*Path(file).parts[-3:])
                out = target / rel
                out.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source, out)
                found.append(str(rel))
    (target / "PACKAGE.txt").write_text(
        f"{dist.metadata['Name']} {dist.version}\nLicense: {dist.metadata.get('License-Expression') or dist.metadata.get('License') or 'See included license files / upstream'}\nLicense files copied: {len(found)}\n",
        encoding="utf-8",
    )
    print(f"{name}: {len(found)} license or notice files")
