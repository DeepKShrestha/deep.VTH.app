import type { User, SafeUser } from "@shared/schema";
import { signProfilePhotoViewUrl } from "./services/attachment-signing";

/** Strip secrets and storage paths; add time-limited `profilePhotoUrl` for `<img src>`. */
export function toClientSafeUser(user: User): SafeUser {
  const {
    passwordHash: _ph,
    totpSecret: _ts,
    profilePhotoPath: stored,
    ...rest
  } = user;
  return {
    ...rest,
    totpEnabled: Boolean(user.totpEnabled),
    profilePhotoUrl: stored ? signProfilePhotoViewUrl(user.id) : null,
  };
}
