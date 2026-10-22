"""History fixtures cover the date boundaries the client groups on. No database required."""

from app.bootstrap.history_fixtures import history_trips

TODAY = "2026-10-20"


def test_history_fixtures_cover_past_ongoing_and_today_boundaries():
    trips = {trip.id: trip for trip in history_trips(TODAY)}
    assert trips["trip-history-past"].end_date < TODAY
    assert trips["trip-history-ends-today"].end_date == TODAY
    assert trips["trip-history-starts-today"].start_date == TODAY
    assert trips["trip-history-ongoing"].start_date < TODAY < trips["trip-history-ongoing"].end_date
    assert trips["trip-history-tomorrow"].start_date > TODAY
    assert all(trip.days for trip in trips.values())
