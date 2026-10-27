import os
import sys
import tempfile
import uuid
from pathlib import Path

from PySide6.QtCore import Qt, QSettings
from PySide6.QtGui import QPixmap
from PySide6.QtWidgets import (QApplication, QCheckBox, QComboBox, QFileDialog,
    QDoubleSpinBox, QFrame, QHBoxLayout, QHeaderView, QLabel, QMainWindow, QMessageBox,
    QPushButton, QScrollArea, QSpinBox, QSplitter, QTableWidget, QTableWidgetItem,
    QVBoxLayout, QWidget)

import backend
from pricing import summarize

STYLE = '''
QWidget { font-family: "Segoe UI"; color: #1c2430; font-size: 13px; }
QMainWindow, QWidget#surface { background: #f2f2f7; }
QFrame#sidebar { background: #fafaff; }
QFrame#card { background: white; border: 1px solid #e2e5ec; border-radius: 12px; }
QLabel#brand { color: #1c2430; font-size: 23px; font-weight: 700; }
QLabel#sideMuted { color: #77818e; font-size: 12px; }
QLabel#sideActive { background: #e4efff; color: #0065d6; padding: 12px; border-radius: 8px; font-weight: 600; }
QLabel#title { font-size: 26px; font-weight: 700; }
QLabel#section { font-size: 17px; font-weight: 700; }
QLabel#muted { color: #77818e; }
QLabel#money { color: #1c2d46; font-size: 24px; font-weight: 700; }
QLabel#preview { background: #edf0f5; border-radius: 8px; color: #77818e; }
QPushButton { background: #edf4ff; border: 1px solid #d5e3f7; border-radius: 8px; padding: 9px 14px; color: #0065d6; font-weight: 600; }
QPushButton:hover { background: #e2efff; }
QPushButton#primary { color: white; background: #007aff; border: 0; padding: 12px 22px; }
QPushButton#primary:hover { background: #0069de; }
QPushButton:disabled { color: #9ca5b1; background: #e6e9ef; }
QComboBox, QSpinBox, QDoubleSpinBox { background: #f9faff; border: 1px solid #dfe4ed; border-radius: 6px; padding: 7px; min-height: 20px; }
QTableWidget { border: 1px solid #e5e9ef; background: white; gridline-color: #edf0f5; selection-background-color: #e6f1ff; }
QTableWidget::item:selected { color: #1c2430; background: #e6f1ff; }
QHeaderView::section { background: #f3f5f9; padding: 7px; border: 0; font-weight: 600; }
'''


def printer_status_text(status):
    if status is None: return 'Status tidak diketahui'
    if status == 0: return 'Siap menurut driver'
    statuses = {1:'Dijeda', 2:'Kesalahan printer', 8:'Kertas macet', 16:'Kertas habis',
                32:'Menunggu kertas manual', 64:'Masalah kertas', 128:'Offline',
                512:'Sibuk', 1024:'Sedang mencetak', 2048:'Baki keluaran penuh',
                4096:'Tidak tersedia', 8192:'Menunggu', 16384:'Memproses',
                65536:'Pemanasan', 131072:'Toner hampir habis', 262144:'Toner habis',
                1048576:'Perlu tindakan pengguna', 4194304:'Pintu terbuka'}
    labels = [label for mask, label in statuses.items() if status & mask]
    known = sum(statuses)
    if status & ~known: labels.append(f'Kode driver tambahan {status & ~known}')
    return ', '.join(labels) if labels else f'Status driver {status}'


def label(text, name=None):
    w = QLabel(text)
    if name: w.setObjectName(name)
    return w


def card():
    w = QFrame(); w.setObjectName('card')
    layout = QVBoxLayout(w); layout.setContentsMargins(20, 20, 20, 20); layout.setSpacing(10)
    return w, layout


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle('HY Print'); self.resize(1380, 900); self.setMinimumSize(980, 680)
        self.settings = QSettings('HY Print', 'HY Print')
        self.tempdir = tempfile.TemporaryDirectory(prefix='hyprint-')
        self.pdf_path = None
        self.pages = []
        self.printers = []
        self._build_ui()
        self.refresh_printers()

    def _build_ui(self):
        surface = QWidget(); surface.setObjectName('surface'); self.setCentralWidget(surface)
        outer = QHBoxLayout(surface); outer.setContentsMargins(0,0,0,0); outer.setSpacing(0)
        side = QFrame(); side.setObjectName('sidebar'); side.setFixedWidth(205)
        sl = QVBoxLayout(side); sl.setContentsMargins(22,28,22,24); sl.setSpacing(12)
        sl.addWidget(label('HY  Print', 'brand')); sl.addWidget(label('PRINT WORKSPACE', 'sideMuted'))
        sl.addSpacing(40); sl.addWidget(label('▣  Cetak dokumen', 'sideActive'))
        sl.addWidget(label('Harga dan pilihan halaman tersedia di ruang kerja.', 'sideMuted'))
        sl.itemAt(sl.count()-1).widget().setWordWrap(True)
        sl.addStretch(); sl.addWidget(label('Periksa pengaturan\nsebelum mencetak.', 'sideMuted'))
        outer.addWidget(side)
        content = QWidget(); root = QVBoxLayout(content); root.setContentsMargins(28,24,28,24); root.setSpacing(12)
        root.addWidget(label('Siapkan cetakan', 'title'))
        root.addWidget(label('Pilih dokumen, atur setiap halaman, lalu periksa estimasi biaya.', 'muted'))
        split = QSplitter(Qt.Orientation.Horizontal); split.setChildrenCollapsible(False)
        doc, dl = card(); dl.addWidget(label('Dokumen', 'section'))
        upload = QPushButton('＋  Pilih dokumen Word atau PDF'); upload.clicked.connect(self.open_document); dl.addWidget(upload)
        self.file_label = label('Belum ada dokumen yang dipilih.', 'muted'); self.file_label.setWordWrap(True); dl.addWidget(self.file_label)
        self.page_table = QTableWidget(0, 5); self.page_table.setHorizontalHeaderLabels(['Cetak','Hal.','Ukuran dokumen','Mode','Salinan'])
        self.page_table.verticalHeader().setVisible(False); self.page_table.setSelectionBehavior(QTableWidget.SelectionBehavior.SelectRows)
        header = self.page_table.horizontalHeader(); header.setSectionResizeMode(2, QHeaderView.ResizeMode.Stretch)
        for col in (0,1,3,4): header.setSectionResizeMode(col, QHeaderView.ResizeMode.ResizeToContents)
        self.page_table.currentCellChanged.connect(self.update_preview)
        dl.addWidget(self.page_table, 3)
        batch = QHBoxLayout(); all_btn = QPushButton('Pilih semua'); none_btn = QPushButton('Kosongkan pilihan')
        all_btn.clicked.connect(lambda: self.select_all(True)); none_btn.clicked.connect(lambda: self.select_all(False))
        batch.addWidget(all_btn); batch.addWidget(none_btn); batch.addStretch(); dl.addLayout(batch)
        note = label('Mode awal berdasarkan perkiraan warna; periksa dan ubah jika perlu.', 'muted'); note.setWordWrap(True); dl.addWidget(note)
        dl.addWidget(label('Pratinjau halaman terpilih', 'section'))
        self.preview = label('Pilih halaman untuk melihat pratinjau.', 'preview'); self.preview.setAlignment(Qt.AlignmentFlag.AlignCenter); self.preview.setMinimumHeight(175)
        dl.addWidget(self.preview, 2); split.addWidget(doc)
        settings, rt = card(); settings.setMinimumWidth(365)
        rt.addWidget(label('Pengaturan cetak', 'section'))
        rt.addWidget(label('Printer')); self.printer = QComboBox(); self.printer.currentIndexChanged.connect(self.printer_changed); rt.addWidget(self.printer)
        self.printer_status = label('', 'muted'); self.printer_status.setWordWrap(True); rt.addWidget(self.printer_status)
        refresh = QPushButton('Perbarui daftar printer'); refresh.clicked.connect(self.refresh_printers); rt.addWidget(refresh)
        rt.addWidget(label('Kertas untuk printer')); self.paper = QComboBox(); rt.addWidget(self.paper)
        self.paper_note = label('Pilihan kertas berasal dari driver printer.', 'muted'); self.paper_note.setWordWrap(True); rt.addWidget(self.paper_note)
        rt.addSpacing(6); rt.addWidget(label('Ambang deteksi warna (%)'))
        self.color_threshold = QDoubleSpinBox(); self.color_threshold.setRange(0.1, 100.0); self.color_threshold.setDecimals(1); self.color_threshold.setSingleStep(0.1); self.color_threshold.setSuffix(' %')
        self.color_threshold.setValue(float(self.settings.value('color_threshold', 1.0)))
        self.color_threshold.valueChanged.connect(lambda value: self.settings.setValue('color_threshold', value)); rt.addWidget(self.color_threshold)
        detect = QPushButton('Terapkan deteksi'); detect.clicked.connect(self.apply_detection); rt.addWidget(detect)
        threshold_note = label('Abaikan sedikit warna di bawah ambang. Hasil hanya perkiraan; mode dapat diubah per halaman.', 'muted'); threshold_note.setWordWrap(True); rt.addWidget(threshold_note)
        rt.addSpacing(6); rt.addWidget(label('Harga per halaman', 'section'))
        for title, name, default in [('Hitam putih (Rp)', 'bw_price', 500), ('Berwarna (Rp)', 'color_price', 1500)]:
            rt.addWidget(label(title)); spin = QSpinBox(); spin.setRange(0, 10000000); spin.setSingleStep(100); spin.setValue(int(self.settings.value(name, default)))
            spin.valueChanged.connect(self.update_total); setattr(self, name, spin); rt.addWidget(spin)
        self.summary = label('Pilih dokumen untuk menghitung biaya.', 'muted'); self.summary.setWordWrap(True); rt.addWidget(self.summary)
        self.total = label('Rp 0', 'money'); rt.addWidget(self.total); rt.addStretch()
        self.print_button = QPushButton('Cetak sekarang'); self.print_button.setObjectName('primary'); self.print_button.clicked.connect(self.print_document); rt.addWidget(self.print_button)
        scroll = QScrollArea(); scroll.setWidgetResizable(True); scroll.setFrameShape(QFrame.Shape.NoFrame); scroll.setMinimumWidth(365); scroll.setWidget(settings)
        split.addWidget(scroll); split.setStretchFactor(0, 3); split.setStretchFactor(1, 2)
        root.addWidget(split, 1); outer.addWidget(content, 1); self.setStyleSheet(STYLE)
        self.print_button.setEnabled(False)

    def refresh_printers(self):
        previous = self.printer.currentText()
        try:
            self.printers = backend.list_printers()
        except Exception as exc:
            self.printers = []; self.printer_status.setText(f'Printer tidak dapat dideteksi: {exc}')
        self.printer.blockSignals(True); self.printer.clear()
        for p in self.printers: self.printer.addItem(p['name'])
        index = self.printer.findText(previous)
        if index < 0:
            index = next((i for i,p in enumerate(self.printers) if p.get('default')), 0)
        self.printer.setCurrentIndex(index if self.printers else -1); self.printer.blockSignals(False)
        self.printer_changed()

    def printer_changed(self, *_):
        i = self.printer.currentIndex(); self.paper.clear()
        if i < 0 or i >= len(self.printers):
            self.printer_status.setText('Tidak ada printer terdeteksi. Pastikan printer terpasang di Windows, lalu perbarui.'); self.update_total(); return
        p = self.printers[i]; self.printer_status.setText(f"{printer_status_text(p.get('status'))} • Port: {p.get('port') or '-'}")
        self.paper.addItem('Gunakan pengaturan printer', None)
        for item in p.get('papers', []):
            name = item.get('name', str(item)) if isinstance(item, dict) else str(item)
            self.paper.addItem(name, name)
        if self.paper.count() == 1: self.paper_note.setText('Driver tidak melaporkan ukuran kertas. Gunakan pengaturan printer.')
        else: self.paper_note.setText('Pilihan kertas berasal dari driver printer.')
        self.update_total()

    def open_document(self):
        path, _ = QFileDialog.getOpenFileName(self, 'Pilih dokumen', '', 'Dokumen (*.pdf *.doc *.docx);;Semua file (*.*)')
        if path: self.load_document(path)

    def load_document(self, path):
        try:
            suffix = Path(path).suffix.lower()
            if suffix in ('.doc', '.docx'):
                pdf = os.path.join(self.tempdir.name, uuid.uuid4().hex + '.pdf')
                backend.convert_word(path, pdf)
            elif suffix == '.pdf': pdf = path
            else: raise ValueError('Format tidak didukung. Pilih file PDF, DOC, atau DOCX.')
            pages = backend.analyze_pdf(pdf)
            if not pages: raise ValueError('Dokumen tidak memiliki halaman yang dapat dibaca.')
            self.pdf_path = pdf; self.file_label.setText(f'{Path(path).name}  •  {len(pages)} halaman')
            self.populate_pages(pages)
        except Exception as exc:
            QMessageBox.critical(self, 'Dokumen tidak dapat dibuka', str(exc))

    def populate_pages(self, pages):
        self.pages = pages; self.page_table.setRowCount(0)
        for row, p in enumerate(pages):
            self.page_table.insertRow(row)
            check = QCheckBox(); check.setChecked(True); check.toggled.connect(self.update_total); self.page_table.setCellWidget(row,0,check)
            page = QTableWidgetItem(str(p['page'])); page.setFlags(page.flags() & ~Qt.ItemFlag.ItemIsEditable); self.page_table.setItem(row,1,page)
            size = QTableWidgetItem(f"{p.get('paper', '?')}  ({p['width_mm']:.0f} × {p['height_mm']:.0f} mm)"); size.setFlags(size.flags() & ~Qt.ItemFlag.ItemIsEditable); self.page_table.setItem(row,2,size)
            mode = QComboBox(); mode.addItem('Hitam putih', False); mode.addItem('Warna', True)
            coverage = p.get('color_coverage')
            detected = coverage >= self.color_threshold.value() / 100 if coverage is not None else p.get('color', False)
            mode.setCurrentIndex(1 if detected else 0)
            if coverage is not None: mode.setToolTip(f'Perkiraan cakupan warna: {coverage * 100:.2f}% dari halaman. Anda dapat mengubah mode ini.')
            mode.currentIndexChanged.connect(self.update_total); self.page_table.setCellWidget(row,3,mode)
            copies = QSpinBox(); copies.setRange(1,999); copies.setValue(1); copies.valueChanged.connect(self.update_total); self.page_table.setCellWidget(row,4,copies)
        if pages: self.page_table.selectRow(0); self.update_preview()
        self.update_total()

    def apply_detection(self):
        for row, page in enumerate(self.pages):
            coverage = page.get('color_coverage')
            if coverage is not None:
                self.page_table.cellWidget(row, 3).setCurrentIndex(1 if coverage >= self.color_threshold.value() / 100 else 0)
        self.update_total()

    def select_all(self, selected):
        for row in range(self.page_table.rowCount()): self.page_table.cellWidget(row,0).setChecked(selected)

    def jobs(self):
        result = []
        for row in range(self.page_table.rowCount()):
            if self.page_table.cellWidget(row,0).isChecked():
                result.append({'page': int(self.page_table.item(row,1).text()), 'color': bool(self.page_table.cellWidget(row,3).currentData()), 'copies': self.page_table.cellWidget(row,4).value()})
        return result

    def update_total(self, *_):
        if not hasattr(self, 'page_table') or not hasattr(self, 'bw_price') or not hasattr(self, 'color_price'): return
        self.settings.setValue('bw_price', self.bw_price.value()); self.settings.setValue('color_price', self.color_price.value())
        result = summarize(self.jobs(), self.bw_price.value(), self.color_price.value())
        self.total.setText('Rp ' + f"{result['total']:,}".replace(',', '.'))
        self.summary.setText(f"{result['bw_pages']} halaman hitam putih  •  {result['color_pages']} halaman warna")
        self.print_button.setEnabled(bool(self.pdf_path and self.jobs() and self.printer.currentIndex() >= 0))

    def update_preview(self, *_):
        row = self.page_table.currentRow()
        if row < 0 or not self.pdf_path: return
        try:
            data = backend.render_preview(self.pdf_path, int(self.page_table.item(row,1).text()) - 1)
            pixmap = QPixmap(); pixmap.loadFromData(data, 'PNG')
            if pixmap.isNull(): raise ValueError('Data pratinjau tidak valid.')
            self.preview.setPixmap(pixmap.scaled(self.preview.size(), Qt.AspectRatioMode.KeepAspectRatio, Qt.TransformationMode.SmoothTransformation))
        except Exception as exc:
            self.preview.setText(f'Pratinjau tidak tersedia: {exc}')

    def print_document(self):
        jobs = self.jobs()
        if not self.pdf_path or not jobs or self.printer.currentIndex() < 0:
            QMessageBox.warning(self, 'Belum siap', 'Pilih dokumen, halaman, dan printer terlebih dahulu.'); return
        result = summarize(jobs, self.bw_price.value(), self.color_price.value())
        answer = QMessageBox.question(self, 'Konfirmasi cetak', f"Kirim {result['bw_pages'] + result['color_pages']} halaman ke {self.printer.currentText()}?\nEstimasi: {self.total.text()}")
        if answer != QMessageBox.StandardButton.Yes: return
        try:
            backend.print_pdf(self.pdf_path, self.printer.currentText(), jobs, paper_name=self.paper.currentData())
            QMessageBox.information(self, 'Dikirim ke printer', 'Pekerjaan telah dikirim ke antrean Windows. Periksa antrean printer untuk status selanjutnya.')
        except Exception as exc: QMessageBox.critical(self, 'Tidak dapat mencetak', str(exc))

    def closeEvent(self, event):
        self.tempdir.cleanup(); super().closeEvent(event)


def main():
    app = QApplication(sys.argv); app.setApplicationName('HY Print')
    window = MainWindow(); window.show(); sys.exit(app.exec())


if __name__ == '__main__': main()



