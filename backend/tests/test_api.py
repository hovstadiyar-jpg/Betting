from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.ingestion.sync import run_sync
from app.providers.demo import DemoProvider


@pytest.fixture
def seeded(session_factory: sessionmaker[Session]) -> None:
    """Demo data anchored to now (so fixtures are upcoming), with 3 hours of price history."""
    now = datetime.now(UTC)
    for minutes in (180, 120, 60, 0):
        run_sync(
            session_factory,
            DemoProvider(as_of=now - timedelta(minutes=minutes)),
            ["demo_premier_division", "demo_pro_basketball"],
        )


def test_health_and_ready(client: TestClient) -> None:
    assert client.get("/health").json() == {"status": "ok", "version": "0.2.0"}
    ready = client.get("/ready")
    assert ready.status_code == 200
    assert ready.json()["database"] == "ok" and ready.json()["schema_version"] == "0002"
    assert ready.json()["latest_sync"] is None


def test_openapi_documents_all_endpoint_groups(client: TestClient) -> None:
    paths = client.get("/openapi.json").json()["paths"]
    for path in [
        "/health",
        "/ready",
        "/api/v1/sports",
        "/api/v1/leagues",
        "/api/v1/bookmakers",
        "/api/v1/fixtures",
        "/api/v1/fixtures/{fixture_id}/odds",
        "/api/v1/odds",
        "/api/v1/props/players",
        "/api/v1/props/teams",
        "/api/v1/value-bets",
        "/api/v1/odds/history/{selection_id}",
        "/api/v1/odds/movements",
        "/api/v1/sync/runs",
    ]:
        assert path in paths, path
    # Read-only API: no write methods anywhere.
    assert all(set(ops) <= {"get"} for ops in paths.values())


@pytest.mark.usefixtures("seeded")
def test_reference_endpoints(client: TestClient) -> None:
    sports = {s["key"]: s for s in client.get("/api/v1/sports").json()}
    assert set(sports) == {"football", "basketball"}
    leagues = client.get("/api/v1/leagues", params={"sport": "football"}).json()
    assert [lg["key"] for lg in leagues] == ["demo_premier_division"]
    assert leagues[0]["upcoming_fixtures"] > 0
    assert len(client.get("/api/v1/bookmakers").json()) == 6
    teams = client.get("/api/v1/teams", params={"league": "demo_premier_division"}).json()
    assert len(teams) == 8 and all(t["league_key"] == "demo_premier_division" for t in teams)
    players = client.get("/api/v1/players", params={"team_id": teams[0]["id"]}).json()
    assert players and all(p["team_id"] == teams[0]["id"] for p in players)
    assert client.get("/api/v1/players", params={"q": "%"}).status_code == 422  # min_length=2


@pytest.mark.usefixtures("seeded")
def test_fixtures_pagination_and_filters(client: TestClient) -> None:
    page = client.get("/api/v1/fixtures", params={"limit": 3}).json()
    assert len(page["items"]) == 3 and page["total"] > 3
    times = [f["starts_at"] for f in page["items"]]
    assert times == sorted(times)
    basketball = client.get("/api/v1/fixtures", params={"sport": "basketball", "limit": 200}).json()
    assert basketball["items"] and all(f["sport_key"] == "basketball" for f in basketball["items"])
    assert all(f["data_source"] == "demo" for f in basketball["items"])
    assert client.get("/api/v1/fixtures/999999").status_code == 404
    assert client.get("/api/v1/fixtures", params={"limit": 0}).status_code == 422


@pytest.mark.usefixtures("seeded")
def test_fixture_odds_shape(client: TestClient) -> None:
    fixture = client.get("/api/v1/fixtures", params={"sport": "football", "limit": 1}).json()["items"][0]
    body = client.get(f"/api/v1/fixtures/{fixture['id']}/odds").json()
    assert body["meta"]["sources"] == ["demo"]
    types = {m["market_type"] for m in body["markets"]}
    assert types == {"match_result", "total", "btts"}  # props excluded by default
    result = next(m for m in body["markets"] if m["market_type"] == "match_result")
    for sel in result["selections"]:
        assert sel["best_price"] == max(p["price"] for p in sel["prices"])
    consensus = [s["consensus_probability"] for s in result["selections"]]
    assert sum(consensus) == pytest.approx(1, abs=1e-9)
    with_props = client.get(f"/api/v1/fixtures/{fixture['id']}/odds", params={"include_props": True}).json()
    assert {"player_prop", "team_prop"} <= {m["market_type"] for m in with_props["markets"]}


@pytest.mark.usefixtures("seeded")
def test_props_endpoints(client: TestClient) -> None:
    players = client.get("/api/v1/props/players", params={"sport": "basketball", "stat": "Points"}).json()
    assert players["items"]
    assert all(
        m["market_type"] == "player_prop" and m["stat"] == "Points" and m["player"] for m in players["items"]
    )
    team_id = players["items"][0]["player"]["team_id"]
    by_team = client.get("/api/v1/props/players", params={"team_id": team_id}).json()["items"]
    assert by_team and all(m["player"]["team_id"] == team_id for m in by_team)
    teams = client.get("/api/v1/props/teams").json()
    assert teams["items"] and all(m["team"] for m in teams["items"])


@pytest.mark.usefixtures("seeded")
def test_value_bets_are_consistent(client: TestClient) -> None:
    body = client.get("/api/v1/value-bets", params={"min_ev": 0.01}).json()
    items = body["items"]
    assert items, "demo data should produce some consensus value"
    evs = [v["ev"] for v in items]
    assert evs == sorted(evs, reverse=True) and min(evs) >= 0.01
    for v in items:
        assert v["ev"] == pytest.approx(v["fair_probability"] * v["best_price"] - 1)
        assert v["books_used"] >= 3 and v["method"] == "consensus"
    assert body["meta"]["sources"] == ["demo"]
    model = client.get("/api/v1/value-bets", params={"method": "model"}).json()
    assert model["items"] == []  # no model probabilities stored yet


@pytest.mark.usefixtures("seeded")
def test_history_and_movements(client: TestClient) -> None:
    movements = client.get("/api/v1/odds/movements", params={"hours": 6, "limit": 10}).json()["items"]
    assert movements
    top = movements[0]
    assert top["observations"] >= 2
    assert top["implied_shift"] == pytest.approx(top["opening_price"] / top["current_price"] - 1)
    shifts = [abs(m["implied_shift"]) for m in movements]
    assert shifts == sorted(shifts, reverse=True)

    history = client.get(
        f"/api/v1/odds/history/{top['selection']['id']}", params={"bookmaker": top["bookmaker_key"]}
    ).json()
    (series,) = history["series"]
    assert series["points"][0]["price"] == top["opening_price"]
    assert series["points"][-1]["price"] == top["current_price"]
    assert client.get("/api/v1/odds/history/999999").status_code == 404

    embedded = client.get(
        "/api/v1/odds/movements", params={"hours": 6, "limit": 1, "include_history": True}
    ).json()
    points = embedded["items"][0]["history"]
    assert len(points) == embedded["items"][0]["observations"]
    assert points[0]["price"] == embedded["items"][0]["opening_price"]


@pytest.mark.usefixtures("seeded")
def test_sync_runs_and_ready_after_sync(client: TestClient) -> None:
    runs = client.get("/api/v1/sync/runs").json()
    assert len(runs) == 4 and all(r["status"] == "succeeded" for r in runs)
    assert client.get("/ready").json()["latest_sync"]["provider"] == "demo"
