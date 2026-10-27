import io
from pathlib import Path
import fitz
import pytest
from PIL import Image
import backend

@pytest.fixture
def pdf(tmp_path):
    path = tmp_path / 'example.pdf'
    d = fitz.open()
    page = d.new_page(width=595.276, height=841.89)
    page.draw_rect(fitz.Rect(100, 100, 300, 300), color=(0,0,0), fill=(0,0,0))
    page = d.new_page(width=612, height=792)
    page.draw_rect(fitz.Rect(100, 100, 300, 300), color=(1,0,0), fill=(1,0,0))
    d.save(str(path)); d.close()
    return path

def test_analysis_identifies_paper_size_and_visible_color(pdf):
    pages = backend.analyze_pdf(pdf)
    assert len(pages) == 2
    assert pages[0]['paper'] == 'A4'
    assert pages[0]['color'] is False
    assert pages[1]['paper'] == 'Letter'
    assert pages[1]['color'] is True
    assert pages[0]['width_mm'] == pytest.approx(210, abs=.2)

def test_preview_returns_png_for_requested_page(pdf):
    png = backend.render_preview(pdf, 1, max_side=400)
    image = Image.open(io.BytesIO(png))
    assert image.format == 'PNG'
    assert max(image.size) <= 400

def test_print_rejects_bad_jobs_before_accessing_printer(pdf):
    with pytest.raises(ValueError):
        backend.print_pdf(pdf, 'not a printer', [{'page': 3, 'color': True, 'copies': 1}])
    with pytest.raises(ValueError):
        backend.print_pdf(pdf, 'not a printer', [{'page': 1, 'color': True, 'copies': 0}])

def test_preview_rejects_invalid_page(pdf):
    with pytest.raises(ValueError):
        backend.render_preview(pdf, 2)

def test_grayscale_jobs_send_grayscale_image_even_if_driver_ignores_color(pdf, monkeypatch):
    import win32print, win32gui, win32ui
    from PIL import ImageWin
    class Mode:
        Fields = 0
    mode = Mode()
    monkeypatch.setattr(win32print, 'OpenPrinter', lambda name: 1)
    monkeypatch.setattr(win32print, 'ClosePrinter', lambda h: None)
    monkeypatch.setattr(win32print, 'GetPrinter', lambda h, level: {'pPortName':'port', 'pDevMode':mode})
    monkeypatch.setattr(win32print, 'DeviceCapabilities', lambda *args: ())
    monkeypatch.setattr(win32gui, 'CreateDC', lambda *args: 42)
    class DC:
        def GetDeviceCaps(self, cap): return 400
        def StartDoc(self, title): pass
        def StartPage(self): pass
        def GetHandleOutput(self): return 42
        def EndPage(self): pass
        def EndDoc(self): pass
        def DeleteDC(self): pass
        def AbortDoc(self): pass
    monkeypatch.setattr(win32ui, 'CreateDCFromHandle', lambda h: DC())
    drawn = []
    class Dib:
        def __init__(self, image): drawn.append(image)
        def draw(self, *args): pass
    monkeypatch.setattr(ImageWin, 'Dib', Dib)
    backend.print_pdf(pdf, 'fake', [{'page':2, 'color':False, 'copies':1}])
    assert drawn
    from PIL import ImageChops
    red, green, blue = drawn[0].split()
    assert ImageChops.difference(red, green).getbbox() is None
    assert ImageChops.difference(green, blue).getbbox() is None

def test_small_colored_area_is_ignored_by_default(tmp_path):
    path = tmp_path / 'little-color.pdf'
    d = fitz.open()
    page = d.new_page(width=595, height=842)
    page.draw_rect(fitz.Rect(50, 50, 55, 55), fill=(1, 0, 0))
    d.save(path); d.close()
    page = backend.analyze_pdf(path)[0]
    assert 0 < page['color_coverage'] < 0.01
    assert page['color'] is False

def test_large_colored_area_meets_default_threshold(pdf):
    page = backend.analyze_pdf(pdf)[1]
    assert 0.01 <= page['color_coverage'] <= 1
    assert page['color'] is True
