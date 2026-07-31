from __future__ import annotations

import importlib.util
import os
import sys
import unittest
from pathlib import Path
from types import ModuleType
from unittest.mock import patch


class FakeFastMCP:
    def __init__(self, _name: str) -> None:
        pass

    def tool(self):
        return lambda function: function

    def run(self) -> None:
        raise AssertionError("El transporte MCP no debe iniciar durante pruebas unitarias")


fake_mcp = ModuleType("mcp")
fake_server = ModuleType("mcp.server")
fake_fastmcp = ModuleType("mcp.server.fastmcp")
fake_fastmcp.FastMCP = FakeFastMCP
sys.modules["mcp"] = fake_mcp
sys.modules["mcp.server"] = fake_server
sys.modules["mcp.server.fastmcp"] = fake_fastmcp

MODULE_PATH = Path(__file__).with_name("server.py")
SPEC = importlib.util.spec_from_file_location("mcp_google_maps_server", MODULE_PATH)
assert SPEC and SPEC.loader
server = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = server
SPEC.loader.exec_module(server)


class MapsServiceTests(unittest.TestCase):
    def test_search_place_candidates_applies_durango_bias(self) -> None:
        response = {
            "places": [
                {
                    "id": "place-1",
                    "displayName": {"text": "Mercado Gómez Palacio"},
                    "formattedAddress": "Zona Centro, Durango, Dgo.",
                    "location": {"latitude": 24.025, "longitude": -104.67},
                    "types": ["market"],
                }
            ]
        }
        with patch.dict(os.environ, {"GOOGLE_MAPS_API_KEY": "test-key"}), patch.object(
            server, "_request_json", return_value=response
        ) as request:
            candidates = server.search_place_candidates("cerca del mercado")

        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0].place_id, "place-1")
        self.assertEqual(candidates[0].coordenadas, [24.025, -104.67])
        payload = request.call_args.kwargs["payload"]
        self.assertEqual(
            payload["locationBias"]["circle"]["center"],
            {"latitude": 24.0277, "longitude": -104.6532},
        )
        self.assertEqual(payload["locationBias"]["circle"]["radius"], 40000)

    def test_geocode_returns_ambiguous_candidates(self) -> None:
        response = {
            "status": "OK",
            "results": [
                {
                    "place_id": "a",
                    "formatted_address": "Av. 20 de Noviembre 100, Durango",
                    "types": ["street_address"],
                    "geometry": {"location": {"lat": 24.02, "lng": -104.66}},
                },
                {
                    "place_id": "b",
                    "formatted_address": "Av. 20 de Noviembre 200, Durango",
                    "types": ["street_address"],
                    "geometry": {"location": {"lat": 24.03, "lng": -104.65}},
                },
            ],
        }
        with patch.dict(os.environ, {"GOOGLE_MAPS_API_KEY": "test-key"}), patch.object(
            server, "_request_json", return_value=response
        ):
            result = server._result("20 de Noviembre", server.geocode_address("20 de Noviembre"))

        self.assertEqual(result["total"], 2)
        self.assertEqual(result["resolucion"], "ambigua")
        self.assertTrue(result["requiere_confirmacion"])

    def test_missing_key_fails_without_leaking_secrets(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaisesRegex(server.MapsServiceError, "GOOGLE_MAPS_API_KEY"):
                server.search_place_candidates("Catedral de Durango")


if __name__ == "__main__":
    unittest.main()
