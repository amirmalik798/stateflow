# SlateFlow Firestore Security Specification (Phase 0 TDD)

## 1. Data Invariants
1. Every `/workspaces/{userId}` document is strictly scoped to `userId == request.auth.uid`, with `ownerId == request.auth.uid`, verified email (`email_verified == true`), and server timestamp (`updatedAt == request.time`).
2. Every `/boards/{boardId}` document must have an immutable `ownerId == request.auth.uid`, immutable `createdAt == request.time` on create, `updatedAt == request.time` on create/update, valid `gridStyle` (`dots`, `grid`, or `blank`), bounded `title` (`1..120` chars), and numeric `camera` map (`x`, `y`, `zoom` in `[0.05, 10]`).
3. Every `/boards/{boardId}/elements/{elementId}` document must pass the Master Gate check on the parent board (`/boards/{boardId}` exists and `ownerId == request.auth.uid`), have immutable `ownerId == request.auth.uid` and `boardId == boardId`, valid `type`, bounded strings/arrays, and server timestamps.
4. All document IDs (`userId`, `boardId`, `elementId`) must match `^[a-zA-Z0-9_\\-]+$` and length `<= 128` on single-document operations (`get`, `create`, `update`, `delete`).
5. List queries on `/boards` and `/boards/{boardId}/elements` enforce `resource.data.ownerId == request.auth.uid` directly in the rule without `get()` or `exists()`.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated read/write** to `/boards/board-1`: Must return `PERMISSION_DENIED`.
2. **Unverified email token** (`email_verified: false`) writing to `/boards/board-1`: Must return `PERMISSION_DENIED`.
3. **Cross-user board read/write**: User B reading or updating User A's board `/boards/board-a1`: Must return `PERMISSION_DENIED`.
4. **Identity spoofing on create**: User B creating `/boards/board-b1` with `ownerId: "userA"`: Must return `PERMISSION_DENIED`.
5. **Shadow / ghost field injection**: Creating a board with an extra field `{ isAdmin: true }`: Must return `PERMISSION_DENIED`.
6. **ID poisoning**: Creating `/boards/bad..id..with..slashes` or a 300-char ID: Must return `PERMISSION_DENIED`.
7. **Client-forged timestamp**: Creating or updating a board with `updatedAt` set to a past client timestamp instead of `request.time`: Must return `PERMISSION_DENIED`.
8. **Immutable field mutation**: Updating `ownerId` or `createdAt` or `boardId` on an existing board or element: Must return `PERMISSION_DENIED`.
9. **Value poisoning on whitelisted update key**: Updating `camera` to `{ x: "NaN", y: 0, zoom: 999 }` or `title` to a 500-char string: Must return `PERMISSION_DENIED`.
10. **Orphaned element write**: Creating `/boards/nonexistent/elements/el-1` where parent board does not exist or belongs to another user: Must return `PERMISSION_DENIED`.
11. **Unbounded array / payload attack**: Creating a `pen` element with `points: []` or > 4000 points or non-map points: Must return `PERMISSION_DENIED`.
12. **Unrestricted list scraping**: Executing `getDocs(collection(db, 'boards'))` without `where('ownerId', '==', uid)`: Must return `PERMISSION_DENIED`.
