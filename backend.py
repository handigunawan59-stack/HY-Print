"""HY Print document inspection and Windows spooler support.

PyMuPDF is offered under the AGPL-3.0 or a commercial license. Distribution of
this module with PyMuPDF must comply with its applicable license.
Color classification is a raster estimate, not a printer ink/coverage measurement.
"""
from pathlib import Path
import pymupdf as fitz
from PIL import Image, ImageChops

SIZES = {'A4': (210, 297), 'A3': (297, 420), 'A5': (148, 210),
         'Letter': (215.9, 279.4), 'Legal': (215.9, 355.6),
         'F4': (210, 330)}


def _paper_name(width, height):
    short, long = sorted((width, height))
    for name, (w, h) in SIZES.items():
        if abs(short - min(w, h)) <= 2 and abs(long - max(w, h)) <= 2:
            return name
    return 'Custom'


def analyze_pdf(path):
    result = []
    with fitz.open(str(path)) as doc:
        if doc.needs_pass:
            raise ValueError('PDF dilindungi kata sandi.')
        for index, page in enumerate(doc):
            width, height = page.rect.width * 25.4 / 72, page.rect.height * 25.4 / 72
            # 72 dpi with RGB, white background, accounts for rendered appearance.
            pix = page.get_pixmap(matrix=fitz.Matrix(1, 1), colorspace=fitz.csRGB, alpha=False)
            image = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
            red, green, blue = image.split()
            difference = ImageChops.lighter(ImageChops.difference(red, green),
                                            ImageChops.difference(red, blue))
            difference = ImageChops.lighter(difference, ImageChops.difference(green, blue))
            colored = sum(difference.histogram()[30:])
            coverage = colored / (pix.width * pix.height)
            result.append({'page': index+1, 'width_mm': round(width, 1),
                           'height_mm': round(height, 1), 'paper': _paper_name(width, height),
                           'color_coverage': coverage, 'color': coverage >= 0.01})
    return result


def render_preview(path, page_index, max_side=900):
    if max_side <= 0:
        raise ValueError('Ukuran preview harus positif.')
    with fitz.open(str(path)) as doc:
        if not 0 <= page_index < len(doc):
            raise ValueError('Halaman tidak tersedia.')
        page = doc[page_index]
        scale = min(1.5, (max_side - 1) / max(page.rect.width, page.rect.height))
        return page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False).tobytes('png')


def convert_word(path, output_pdf):
    """Convert Word to PDF with installed desktop Word. Output is caller-owned."""
    import pythoncom
    import win32com.client
    path, output_pdf = str(Path(path).resolve()), str(Path(output_pdf).resolve())
    pythoncom.CoInitialize()
    app = None
    doc = None
    try:
        app = win32com.client.DispatchEx('Word.Application')
        app.Visible = False
        app.DisplayAlerts = 0
        app.AutomationSecurity = 3  # force-disable macros
        doc = app.Documents.Open(path, ReadOnly=True, AddToRecentFiles=False,
                                 ConfirmConversions=False, Visible=False, NoEncodingDialog=True)
        doc.ExportAsFixedFormat(output_pdf, 17, OpenAfterExport=False)
        return output_pdf
    finally:
        if doc is not None:
            doc.Close(False)
        if app is not None:
            app.Quit(False)
        pythoncom.CoUninitialize()


def list_printers():
    import win32con
    import win32print
    flags = win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS
    try:
        default = win32print.GetDefaultPrinter()
    except Exception:
        default = None
    result = []
    for _, _, name, _ in win32print.EnumPrinters(flags):
        handle = None
        try:
            handle = win32print.OpenPrinter(name)
            info = win32print.GetPrinter(handle, 2)
            port = info['pPortName'] or ''
            try:
                names = win32print.DeviceCapabilities(name, port, win32con.DC_PAPERNAMES)
                papers = list(names or ())
            except Exception:
                papers = []
            result.append({'name': name, 'default': name == default,
                           'status': info['Status'], 'port': port, 'papers': papers})
        except Exception:
            result.append({'name': name, 'default': name == default,
                           'status': None, 'port': '', 'papers': []})
        finally:
            if handle is not None:
                win32print.ClosePrinter(handle)
    return result


def print_pdf(path, printer_name, jobs, paper_name=None):
    """Spool each requested page with per-job color, copies and paper settings.

    jobs: [{'page': 1, 'color': True, 'copies': 1}, ...]. Page numbers are 1-based.
    A successful return confirms spooling, not physical output.
    """
    jobs = list(jobs)
    with fitz.open(str(path)) as doc:
        if not jobs:
            raise ValueError('Pilih setidaknya satu halaman.')
        for job in jobs:
            if not isinstance(job.get('page'), int) or not 1 <= job['page'] <= len(doc):
                raise ValueError('Nomor halaman tidak valid.')
            if not isinstance(job.get('copies'), int) or not 1 <= job['copies'] <= 999:
                raise ValueError('Jumlah salinan harus 1 sampai 999.')
            if not isinstance(job.get('color'), bool):
                raise ValueError('Mode warna tidak valid.')
        import win32con, win32print, win32ui, win32gui
        from PIL import Image, ImageWin
        handle = win32print.OpenPrinter(printer_name)
        try:
            info = win32print.GetPrinter(handle, 2)
            port = info['pPortName'] or ''
            names = win32print.DeviceCapabilities(printer_name, port, win32con.DC_PAPERNAMES) or ()
            ids = win32print.DeviceCapabilities(printer_name, port, win32con.DC_PAPERS) or ()
            if paper_name and paper_name not in names:
                raise ValueError('Ukuran kertas tidak didukung printer.')
            for job in jobs:
                page = doc[job['page'] - 1]
                devmode = info['pDevMode']
                devmode.Fields |= win32con.DM_COLOR | win32con.DM_ORIENTATION | win32con.DM_COPIES
                devmode.Color = win32con.DMCOLOR_COLOR if job['color'] else win32con.DMCOLOR_MONOCHROME
                devmode.Orientation = win32con.DMORIENT_LANDSCAPE if page.rect.width > page.rect.height else win32con.DMORIENT_PORTRAIT
                # Separate spool documents make copies predictable, avoiding driver collation surprises.
                devmode.Copies = 1
                if paper_name:
                    devmode.Fields |= win32con.DM_PAPERSIZE
                    devmode.PaperSize = ids[names.index(paper_name)]
                for copy in range(job['copies']):
                    hdc = win32gui.CreateDC('WINSPOOL', printer_name, devmode)
                    dc = win32ui.CreateDCFromHandle(hdc)
                    started = False
                    try:
                        max_width, max_height = dc.GetDeviceCaps(win32con.HORZRES), dc.GetDeviceCaps(win32con.VERTRES)
                        scale = min(max_width / page.rect.width, max_height / page.rect.height)
                        # Cap intermediate raster at 300 dpi to limit memory consumption.
                        raster_scale = min(scale, 300/72)
                        pix = page.get_pixmap(matrix=fitz.Matrix(raster_scale, raster_scale), colorspace=fitz.csRGB, alpha=False)
                        im = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
                        if not job['color']:
                            im = im.convert('L').convert('RGB')
                        target_w, target_h = round(page.rect.width * scale), round(page.rect.height * scale)
                        x, y = (max_width - target_w)//2, (max_height - target_h)//2
                        dc.StartDoc(f'HY Print - {Path(path).name} - halaman {job["page"]}')
                        started = True
                        dc.StartPage()
                        ImageWin.Dib(im).draw(dc.GetHandleOutput(), (x, y, x+target_w, y+target_h))
                        dc.EndPage()
                        dc.EndDoc()
                        started = False
                    finally:
                        if started:
                            dc.AbortDoc()
                        dc.DeleteDC()
        finally:
            win32print.ClosePrinter(handle)
