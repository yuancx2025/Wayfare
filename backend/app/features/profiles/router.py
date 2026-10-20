from app.contracts.travel import Preferences
from app.core.routing import ApiRouter
from app.features.profiles.dependencies import ProfileServiceDep, UserIdDep
from app.features.profiles.schemas import Me, ProfilePatch

router = ApiRouter(prefix="/me", tags=["me"])


@router.get("", response_model=Me)
async def get_me(profiles: ProfileServiceDep, user_id: UserIdDep) -> Me:
    return await profiles.me(user_id)


@router.patch("", response_model=Me)
async def patch_me(patch: ProfilePatch, profiles: ProfileServiceDep, user_id: UserIdDep) -> Me:
    return await profiles.update_profile(user_id, patch)


@router.get("/preferences", response_model=Preferences)
async def get_preferences(profiles: ProfileServiceDep, user_id: UserIdDep) -> Preferences:
    return await profiles.preferences(user_id)


@router.put("/preferences", response_model=Preferences)
async def put_preferences(prefs: Preferences, profiles: ProfileServiceDep, user_id: UserIdDep) -> Preferences:
    return await profiles.save_preferences(user_id, prefs)
