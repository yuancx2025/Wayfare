class AppError(Exception):
    """Raised by feature services. `main.py` renders it exactly like `HTTPException`: `{"detail": ...}` with `status_code`."""

    status_code = 400

    def __init__(self, detail: str, status_code: int | None = None):
        super().__init__(detail)
        self.detail = detail
        if status_code is not None:
            self.status_code = status_code


class NotFound(AppError):
    status_code = 404


class Conflict(AppError):
    status_code = 409


class Gone(AppError):
    status_code = 410


class Unprocessable(AppError):
    status_code = 422


class BadGateway(AppError):
    status_code = 502


class UpstreamError(Exception):
    """An external provider (Google Places/Routes, ...) failed. Features catch this, never provider-specific errors."""

    status: int = 0


class PlanningError(Exception):
    def __init__(self, message: str, retryable: bool = True):
        super().__init__(message)
        self.retryable = retryable
