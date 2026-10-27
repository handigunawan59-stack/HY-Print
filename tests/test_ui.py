import os
os.environ['QT_QPA_PLATFORM'] = 'offscreen'
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from PySide6.QtWidgets import QApplication
from app import MainWindow


def test_pages_can_be_selected_and_configured(monkeypatch, tmp_path):
    app = QApplication.instance() or QApplication([])
    monkeypatch.setattr('backend.list_printers', lambda: [])
    from PySide6.QtCore import QSettings
    monkeypatch.setattr('app.QSettings', lambda *args: QSettings(str(tmp_path / 'settings.ini'), QSettings.Format.IniFormat))
    window = MainWindow()
    window.populate_pages([{'page': 1, 'width_mm': 210, 'height_mm': 297, 'paper': 'A4', 'color': False}, {'page': 2, 'width_mm': 210, 'height_mm': 297, 'paper': 'A4', 'color': True}])
    assert window.jobs() == [{'page': 1, 'color': False, 'copies': 1}, {'page': 2, 'color': True, 'copies': 1}]
    window.page_table.cellWidget(0, 0).setChecked(False)
    assert window.jobs() == [{'page': 2, 'color': True, 'copies': 1}]
    window.close()



def test_document_choices_and_price_are_sent_to_printer(monkeypatch, tmp_path):
    import pymupdf
    import backend
    from PySide6.QtWidgets import QMessageBox
    app = QApplication.instance() or QApplication([])
    monkeypatch.setattr(backend, 'list_printers', lambda: [{'name':'Printer A', 'default':True, 'status':0, 'port':'USB', 'papers':['A4']}])
    sent = []
    monkeypatch.setattr(backend, 'print_pdf', lambda *a, **kw: sent.append((a, kw)))
    monkeypatch.setattr(QMessageBox, 'question', lambda *a: QMessageBox.StandardButton.Yes)
    monkeypatch.setattr(QMessageBox, 'information', lambda *a: None)
    pdf = tmp_path / 'example.pdf'
    doc = pymupdf.open(); doc.new_page(); doc.new_page(); doc.save(str(pdf)); doc.close()
    from PySide6.QtCore import QSettings
    monkeypatch.setattr('app.QSettings', lambda *args: QSettings(str(tmp_path / 'settings.ini'), QSettings.Format.IniFormat))
    window = MainWindow(); window.load_document(str(pdf))
    window.bw_price.setValue(200); window.color_price.setValue(800)
    window.page_table.cellWidget(1, 3).setCurrentIndex(1)
    window.page_table.cellWidget(1, 4).setValue(2)
    window.paper.setCurrentIndex(1)
    assert window.total.text() == 'Rp 1.800'
    window.print_document()
    assert sent[0][0][1:] == ('Printer A', [{'page':1,'color':False,'copies':1},{'page':2,'color':True,'copies':2}])
    assert sent[0][1]['paper_name'] == 'A4'
    window.close()



def test_color_threshold_can_be_adjusted_and_reapplied(monkeypatch, tmp_path):
    import backend
    from PySide6.QtCore import QSettings
    app = QApplication.instance() or QApplication([])
    monkeypatch.setattr(backend, 'list_printers', lambda: [])
    monkeypatch.setattr('app.QSettings', lambda *args: QSettings(str(tmp_path / 'settings.ini'), QSettings.Format.IniFormat))
    window = MainWindow()
    window.populate_pages([
        {'page':1,'width_mm':210,'height_mm':297,'paper':'A4','color':True,'color_coverage':0.005},
        {'page':2,'width_mm':210,'height_mm':297,'paper':'A4','color':True,'color_coverage':0.02},
    ])
    assert window.color_threshold.value() == 1.0
    assert [j['color'] for j in window.jobs()] == [False, True]
    window.color_threshold.setValue(0.1)
    assert [j['color'] for j in window.jobs()] == [False, True]
    window.apply_detection()
    assert [j['color'] for j in window.jobs()] == [True, True]
    window.page_table.cellWidget(0, 3).setCurrentIndex(0)
    assert [j['color'] for j in window.jobs()] == [False, True]
    window.close()


def test_printer_status_is_readable():
    from app import printer_status_text
    assert printer_status_text(0) == 'Siap menurut driver'
    assert 'Offline' in printer_status_text(128)
    assert 'Kertas habis' in printer_status_text(16)
    assert 'tidak diketahui' in printer_status_text(None).lower()
import pytest


@pytest.fixture(autouse=True)
def isolated_settings(monkeypatch, tmp_path):
    from PySide6.QtCore import QSettings
    import app
    monkeypatch.setattr(app, 'QSettings', lambda *args: QSettings(str(tmp_path / 'settings.ini'), QSettings.Format.IniFormat))
