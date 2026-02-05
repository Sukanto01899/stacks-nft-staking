(define-constant err-not-admin (err u100))

(define-constant mint-price u0)

(define-data-var admin principal tx-sender)
(define-data-var last-token-id uint u0)
(define-map minted-count { owner: principal } { count: uint })

(define-non-fungible-token nft uint)

(define-read-only (get-admin)
  (ok (var-get admin))
)

(define-read-only (get-mint-price)
  (ok mint-price)
)

(define-read-only (get-last-token-id)
  (ok (var-get last-token-id))
)

(define-read-only (get-user-minted (owner principal))
  (match (map-get? minted-count { owner: owner })
    entry (ok (get count entry))
    (ok u0)
  )
)

(define-read-only (get-owner (token-id uint))
  (ok (nft-get-owner? nft token-id))
)

(define-public (mint)
  (let ((next-id (+ (var-get last-token-id) u1)))
    (begin
      (try! (stx-transfer? mint-price tx-sender (as-contract tx-sender)))
      (try! (nft-mint? nft next-id tx-sender))
      (var-set last-token-id next-id)
      (let (
        (current (default-to { count: u0 } (map-get? minted-count { owner: tx-sender })))
        (updated (+ (get count current) u1))
      )
        (map-set minted-count { owner: tx-sender } { count: updated })
      )
      (ok next-id)
    )
  )
)

(define-public (transfer (token-id uint) (sender principal) (recipient principal))
  (nft-transfer? nft token-id sender recipient)
)

(define-public (withdraw (amount uint) (recipient principal))
  (begin
    (asserts! (is-eq tx-sender (var-get admin)) err-not-admin)
    (as-contract (stx-transfer? amount tx-sender recipient))
  )
)
