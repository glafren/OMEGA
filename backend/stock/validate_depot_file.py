import json
import sys
from pathlib import Path

from siparis_app import validate_depot_type_workbook


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Kullanım: validate_depot_file.py DOSYA.xlsx")
    result = validate_depot_type_workbook(Path(sys.argv[1]).resolve())
    print(json.dumps(result, ensure_ascii=True))
    if result["row_count"] < 1 or result["error_count"] > 0:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
