import importlib.util
import tempfile
import unittest
from pathlib import Path

SPEC = importlib.util.spec_from_file_location("triage_rag", Path(__file__).with_name("main.py"))
assert SPEC and SPEC.loader
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)

class RagTests(unittest.TestCase):
    def make_service(self):
        directory = Path(tempfile.mkdtemp())
        vectorizer = MODULE.Vectorizer()
        service = MODULE.RagService(index_dir=directory, vectorizer=vectorizer)
        service.reports.replace([
            {"id": "near", "reporte_id": "near", "texto": "fuga de agua tubería rota", "categoria": "fuga_agua", "coordenadas": [24.05, -104.68], "timestamp": "2026-07-29T12:00:00Z"},
            {"id": "far", "reporte_id": "far", "texto": "fuga de agua tubería rota", "categoria": "fuga_agua", "coordenadas": [25, -104.68], "timestamp": "2026-07-29T12:00:00Z"},
            {"id": "old", "reporte_id": "old", "texto": "fuga de agua tubería rota", "categoria": "fuga_agua", "coordenadas": [24.05, -104.68], "timestamp": "2020-07-29T12:00:00Z"},
        ], "texto")
        service.payments.replace([{"id": "p-1", "clave_catastral": "ABC-1", "ubicacion": "Zaragoza esquina Hidalgo", "al_corriente": True, "actualizado_en": "2026-07-01", "texto": "ABC-1 Zaragoza esquina Hidalgo"}], "texto")
        return service, directory

    def test_nearby_reports_return_contract_fields(self):
        service, _ = self.make_service()
        result = service.search_reports(MODULE.SearchInput(texto="fuga de agua tubería rota", lat=24.05, lon=-104.68, radio_km=1, dias=30), MODULE.parse_time("2026-07-30T12:00:00Z"))
        self.assertIn("similares_encontrados", result)
        self.assertIn("posible_causa_estructural", result)
        self.assertIn("muestras", result)
        self.assertEqual(result["similares_encontrados"], 1)
        self.assertEqual(result["muestras"][0]["reporte_id"], "near")

    def test_index_survives_restart_and_payment_is_context_only(self):
        service, directory = self.make_service()
        reopened = MODULE.RagService(index_dir=directory, vectorizer=service.vectorizer)
        result = reopened.search_payments(MODULE.PaymentInput(clave_catastral="ABC-1"))
        self.assertTrue(result["encontrado"])
        self.assertTrue(result["al_corriente"])
        self.assertNotIn("propietario", result)

    def test_rebuild_uses_only_confirmed_source_records(self):
        class Source:
            def confirmed_reports(self):
                return [{"reporte_id": "confirmed", "texto": "bache profundo", "coordenadas": [24.0, -104.0], "created_at": "2026-07-30T00:00:00Z", "categoria": "bache"}]
            def confirmed_report(self, reporte_id):
                return self.confirmed_reports()[0] if reporte_id == "confirmed" else None
            def predial(self): return []
        service = MODULE.RagService(source=Source(), index_dir=Path(tempfile.mkdtemp()))
        self.assertEqual(service.rebuild(), {"reportes": 1, "predial": 0})
        self.assertEqual(service.reports.records[0]["reporte_id"], "confirmed")

    def test_haversine_has_zero_distance(self):
        self.assertEqual(MODULE.haversine_km(24, -104, 24, -104), 0)

if __name__ == "__main__":
    unittest.main()
