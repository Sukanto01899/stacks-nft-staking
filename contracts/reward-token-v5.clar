(define-constant err-not-admin (err u100))
(define-constant err-not-minter (err u101))
(define-constant err-not-token-owner (err u102))

(define-data-var admin principal tx-sender)
(define-data-var minter principal tx-sender)

(define-fungible-token reward-token)

(define-read-only (get-admin)
  (ok (var-get admin))
)

(define-read-only (get-minter)
  (ok (var-get minter))
)

(define-read-only (get-name)
  (ok "Reward Token")
)

(define-read-only (get-symbol)
  (ok "RWRD"))

(define-read-only (get-decimals)
  (ok u6)
)

(define-read-only (get-balance (owner principal))
  (ok (ft-get-balance reward-token owner))
)

(define-read-only (get-total-supply)
  (ok (ft-get-supply reward-token))
)

(define-public (transfer (amount uint) (sender principal) (recipient principal) (memo (optional (buff 34))))
  (begin
    (asserts! (is-eq tx-sender sender) err-not-token-owner)
    (ft-transfer? reward-token amount sender recipient)
  )
)

(define-public (mint (amount uint) (recipient principal))
  (begin
    (asserts!
      (or
        (is-eq tx-sender (var-get minter))
        (is-eq contract-caller (var-get minter))
      )
      err-not-minter
    )
    (ft-mint? reward-token amount recipient)
  )
)

(define-public (burn (amount uint) (owner principal))
  (begin
    (asserts! (is-eq tx-sender owner) err-not-token-owner)
    (ft-burn? reward-token amount owner)
  )
)

(define-public (set-minter (new-minter principal))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) err-not-admin)
    (var-set minter new-minter)
    (ok true)
  )
)
