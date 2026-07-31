import importlib.util
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location("triage_rag", Path(__file__).with_name("main.py"))
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

class RagTests(unittest.TestCase):
    def test_nearby_reports_return_contract_fields(self):
        result = MODULE.buscar_reportes(MODULE.SearchInput(texto="fuga de agua", lat=24.05321, lon=-104.68441, radio_km=1, dias=365))
        self.assertIn("similares_encontrados", result)
        self.assertIn("posible_causa_estructural", result)
        self.assertIn("muestras", result)

    def test_haversine_has_zero_distance(self):
        self.assertEqual(MODULE.haversine_km(24, -104, 24, -104), 0)

if __name__ == "__main__":
    unittest.main()
