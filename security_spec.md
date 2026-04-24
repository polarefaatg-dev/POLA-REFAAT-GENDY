# Security Specification - MateriaTrack

## 1. Data Invariants
- **Material Submittals**: Must belong to valid divisions. `boqRef` must be unique in intent (though not enforced by Firestore uniquely).
- **History Logs**: Must be intrinsically linked to a parent `MaterialSubmittal`.
- **Time Logs**: Must belong to the `request.auth.uid`.
- **PO Status**: Must be one of the 4 defined procurement states.

## 2. The Dirty Dozen (Test Payloads)
1. **The Ghost Field**: Update `material` with `isAdmin: true`. (Target: Reject)
2. **The Status Jump**: Set status to `Approved` without proper role or transition logic. (Target: Reject)
3. **The Identity Spoof**: Create a `timelog` for another user's `userId`. (Target: Reject)
4. **The Orphan History**: Create a `history` document in another submittal's subcollection. (Target: Reject)
5. **The Billion Character ID**: Attempt to create a document with a 1MB ID string. (Target: Reject)
6. **The PII Leak**: Read another user's `timelog` or internal `history` without membership. (Target: Reject)
7. **The Negative Quantity**: Submit a material with `-50` quantity. (Target: Reject)
8. **The Timeless Post**: Submit a submittal without `createdAt` or with a fake client date. (Target: Reject)
9. **The Priority Bloat**: Set priority to `URGENT` (not in enum). (Target: Reject)
10. **The Anonymous Write**: Attempt to write without any `auth` object. (Target: Reject)
11. **The Unverified Entry**: Write as a user with `email_verified: false`. (Target: Reject)
12. **The Shadow Revision**: Change a `createdAt` field during an update. (Target: Reject)

## 3. Vulnerability Analysis & Mission
- **Issue A**: `history` creation fails because `submittalId` is missing in payload but required by rules.
- **Issue B**: `isValidMaterial` is missing validation for 10+ new fields (PO, IR, etc).
- **Issue C**: `isVerified` might be too strict for initial preview users.
