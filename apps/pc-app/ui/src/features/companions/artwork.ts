/** Project-owned scene artwork is reused; imported appearances keep their own live sprite. */
export const hasYuwanRoomArtwork = (resourceId: string) => /^builtin:lingjing-(?:battle-)?yuwan-v\d+$/.test(resourceId);
