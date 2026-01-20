(define-constant err-not-token-owner (err u100))
(define-constant err-already-staked (err u101))
(define-constant err-not-staked (err u102))

(define-constant blocks-per-hour u6)
;; reward-token uses 6 decimals; 1 token = 1_000_000 units
(define-constant reward-per-hour u1000000)

(define-map staked
  { token-id: uint }
  { owner: principal, staked-at: uint, last-claim: uint }
)

(define-read-only (get-stake (token-id uint))
  (ok (map-get? staked { token-id: token-id }))
)

(define-read-only (get-pending-reward (token-id uint))
  (match (map-get? staked { token-id: token-id })
    stake-data
      (let (
        (now block-height)
        (last (get last-claim stake-data))
        (elapsed (if (> now last) (- now last) u0))
        (hours (/ elapsed blocks-per-hour))
      )
        (ok (* hours reward-per-hour))
      )
    (ok u0)
  )
)

(define-private (calculate-reward (last-claim uint) (now uint))
  (let (
    (elapsed (if (> now last-claim) (- now last-claim) u0))
    (hours (/ elapsed blocks-per-hour))
    (amount (* hours reward-per-hour))
    (new-last (+ last-claim (* hours blocks-per-hour)))
  )
    { amount: amount, new-last: new-last }
  )
)

(define-public (stake (token-id uint))
  (begin
    (asserts! (is-none (map-get? staked { token-id: token-id })) err-already-staked)
    (try! (contract-call? .public-mint-nft-v2 transfer token-id tx-sender (as-contract tx-sender)))
    (map-set staked
      { token-id: token-id }
      { owner: tx-sender, staked-at: block-height, last-claim: block-height }
    )
    (ok true)
  )
)

(define-public (claim (token-id uint))
  (let ((stake-data (unwrap! (map-get? staked { token-id: token-id }) err-not-staked)))
    (begin
      (asserts! (is-eq tx-sender (get owner stake-data)) err-not-token-owner)
      (let (
        (reward (calculate-reward (get last-claim stake-data) block-height))
        (amount (get amount reward))
        (new-last (get new-last reward))
      )
        (begin
          (if (> amount u0)
            (try! (contract-call? .reward-token-v2 mint amount tx-sender))
            true
          )
          (map-set staked
            { token-id: token-id }
            { owner: (get owner stake-data), staked-at: (get staked-at stake-data), last-claim: new-last }
          )
          (ok amount)
        )
      )
    )
  )
)

(define-public (unstake (token-id uint))
  (let ((stake-data (unwrap! (map-get? staked { token-id: token-id }) err-not-staked)))
    (begin
      (asserts! (is-eq tx-sender (get owner stake-data)) err-not-token-owner)
      (let (
        (reward (calculate-reward (get last-claim stake-data) block-height))
        (amount (get amount reward))
      )
        (begin
          (if (> amount u0)
            (try! (contract-call? .reward-token-v2 mint amount tx-sender))
            true
          )
          (try! (contract-call? .public-mint-nft-v2 transfer token-id (as-contract tx-sender) tx-sender))
          (map-delete staked { token-id: token-id })
          (ok amount)
        )
      )
    )
  )
)
