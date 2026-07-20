# Coupon System

Last verified: 2026-07-20 KST

## Policy

- Every coupon campaign grants exactly 600 credits per account.
- A campaign has a server-generated `WONY-XXXX-XXXX` code, optional start/end times, an optional maximum redemption count, and an active switch.
- A user can redeem the same campaign only once. Credits issued by a coupon do not expire; only the redemption window can expire.
- Shared networks do not block account creation or redemption. Kakao and Google provider identities remain unique account keys.

## User Flow

1. A code or full coupon URL can be pasted into the account-menu or wallet dialog.
2. A QR opens `/coupon/{code}` without requiring an existing session.
3. A guest chooses Kakao or Google. OAuth stores that coupon path as `returnTo` and sends the user back after signup or login.
4. The coupon page sends one authenticated POST request. A successful new signup therefore receives 100 welcome credits plus 600 coupon credits, for a 700-credit starting balance.
5. The result popup distinguishes a new grant from an already-redeemed coupon and refreshes the shared account balance.

GET requests never grant credits. Public lookup returns only the campaign title, fixed credit amount, dates, and availability state.

## Data And Idempotency

- `CouponCampaign` owns the code, dates, quota, active state, and atomic `redeemedCount`.
- `CouponRedemption` snapshots the 600-credit grant and resulting balance. Its `[campaignId, userId]` unique key is the final duplicate boundary.
- The redemption transaction atomically reserves one campaign slot, increments the user balance, inserts the redemption, and writes `CreditLedger` with `coupon:{campaignId}:{userId}:grant`.
- Concurrent duplicate requests either return the existing redemption or roll back. A last-slot race uses an atomic conditional campaign update, so the quota cannot be exceeded.

## Administration

The admin page supports campaign creation and editing, active/pause control, code and claim-link copy, QR preview, PNG download, redemption progress, and the five most recent recipients. QR images are generated locally by the server with the `qrcode` package; coupon URLs are not sent to an external QR service.

## Routes

- `GET /api/coupons/lookup/{code}`: public, read-only availability
- `POST /api/coupons/redeem`: authenticated grant
- `GET|POST|PATCH /api/admin/coupons`: administrator campaign management
- `GET /api/admin/coupons/{id}/qr`: administrator QR preview or download
- `GET /coupon/{code}`: public QR landing and OAuth return page
