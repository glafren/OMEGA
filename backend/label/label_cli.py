import os
import sys
from pathlib import Path

import etiket_yazdirma as app


class _Root:
    def withdraw(self):
        pass


def main():
    if len(sys.argv) != 4:
        raise SystemExit("Kullanım: label_cli.py SIPARIS_DOSYASI ETIKET_PDF CIKTI_PDF")

    order_path, pdf_path, output_path = map(lambda value: str(Path(value).resolve()), sys.argv[1:4])
    selections = iter([order_path, pdf_path])
    errors = []

    app.Tk = _Root
    app.filedialog.askopenfilename = lambda **_: next(selections)
    app.filedialog.asksaveasfilename = lambda **_: output_path
    app.messagebox.showwarning = lambda title, message: print(f"UYARI: {message}", file=sys.stderr)
    app.messagebox.showinfo = lambda *_args, **_kwargs: None
    app.messagebox.showerror = lambda title, message: errors.append(message)

    previous = os.getcwd()
    try:
        os.chdir(Path(__file__).resolve().parent)
        app.main()
    finally:
        os.chdir(previous)

    if errors:
        raise RuntimeError(errors[-1])
    if not Path(output_path).exists():
        raise RuntimeError("Etiket çıktısı oluşturulamadı.")
    print(output_path)


if __name__ == "__main__":
    main()
