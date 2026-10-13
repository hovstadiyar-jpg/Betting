from datetime import UTC, datetime

from fastapi import APIRouter, Query
from sqlalchemy import and_, func, select

from app.api.deps import DbSession
from app.models import Bookmaker, Fixture, League, Player, Sport, Team
from app.models.enums import FixtureStatus
from app.repositories.odds import IN_PLAY_GRACE
from app.schemas.api import BookmakerOut, LeagueOut, PlayerOut, SportOut, TeamOut

router = APIRouter(tags=["reference"])


@router.get("/sports", response_model=list[SportOut], summary="List sports")
def list_sports(db: DbSession) -> list[SportOut]:
    rows = db.execute(
        select(Sport, func.count(League.id))
        .outerjoin(League, League.sport_id == Sport.id)
        .group_by(Sport.id)
        .order_by(Sport.name)
    ).all()
    return [SportOut(key=s.key, name=s.name, active=s.active, league_count=n) for s, n in rows]


@router.get("/leagues", response_model=list[LeagueOut], summary="List leagues / competitions")
def list_leagues(
    db: DbSession,
    sport: str | None = Query(default=None, description="Sport key, e.g. football"),
) -> list[LeagueOut]:
    upcoming = and_(
        Fixture.league_id == League.id,
        Fixture.status.in_([FixtureStatus.SCHEDULED.value, FixtureStatus.LIVE.value]),
        Fixture.starts_at >= datetime.now(UTC) - IN_PLAY_GRACE,
    )
    stmt = (
        select(League, Sport.key, func.count(Fixture.id))
        .join(Sport, Sport.id == League.sport_id)
        .outerjoin(Fixture, upcoming)
        .group_by(League.id, Sport.key)
        .order_by(Sport.key, League.name)
    )
    if sport:
        stmt = stmt.where(Sport.key == sport)
    return [
        LeagueOut(
            key=lg.key, name=lg.name, sport_key=sk, region=lg.region, active=lg.active, upcoming_fixtures=n
        )
        for lg, sk, n in db.execute(stmt).all()
    ]


@router.get("/bookmakers", response_model=list[BookmakerOut], summary="List bookmakers")
def list_bookmakers(db: DbSession) -> list[BookmakerOut]:
    books = db.scalars(select(Bookmaker).where(Bookmaker.active.is_(True)).order_by(Bookmaker.name)).all()
    return [BookmakerOut.model_validate(b) for b in books]


@router.get("/teams", response_model=list[TeamOut], summary="List teams")
def list_teams(
    db: DbSession,
    sport: str | None = None,
    league: str | None = Query(default=None, description="League key (the team's primary league)"),
    limit: int = Query(default=500, ge=1, le=2000),
) -> list[TeamOut]:
    stmt = (
        select(Team, Sport.key, League.key)
        .join(Sport, Sport.id == Team.sport_id)
        .outerjoin(League, League.id == Team.league_id)
        .order_by(Team.name)
        .limit(limit)
    )
    if sport:
        stmt = stmt.where(Sport.key == sport)
    if league:
        stmt = stmt.where(League.key == league)
    return [
        TeamOut(id=t.id, name=t.name, short_name=t.short_name, sport_key=sk, league_key=lk)
        for t, sk, lk in db.execute(stmt).all()
    ]


@router.get("/players", response_model=list[PlayerOut], summary="List players")
def list_players(
    db: DbSession,
    sport: str | None = None,
    team_id: int | None = None,
    q: str | None = Query(
        default=None, min_length=2, max_length=100, description="Case-insensitive name search"
    ),
    limit: int = Query(default=500, ge=1, le=2000),
) -> list[PlayerOut]:
    stmt = (
        select(Player, Sport.key).join(Sport, Sport.id == Player.sport_id).order_by(Player.name).limit(limit)
    )
    if sport:
        stmt = stmt.where(Sport.key == sport)
    if team_id is not None:
        stmt = stmt.where(Player.team_id == team_id)
    if q:
        stmt = stmt.where(Player.name.icontains(q, autoescape=True))
    return [
        PlayerOut(id=p.id, name=p.name, position=p.position, sport_key=sk, team_id=p.team_id)
        for p, sk in db.execute(stmt).all()
    ]
