# Launcher messaging and encryption

Messaging uses the existing Supabase project and Azuria sign-in. No new keys or providers are required.

## Enable after merging

1. Open Supabase → SQL Editor.
2. Run `services/accounts/supabase/migrations/202610240003_messaging.sql` once, after the existing accounts and friends migrations.
3. Run `services/accounts/supabase/migrations/202610240004_message_encryption.sql` once, after the messaging migration. If you already ran the first migration, run only this new encryption migration.
4. Run `services/accounts/supabase/migrations/202610240005_social_conversations.sql` once to enable the recent Chats list. This index returns conversation IDs, dates and unread counts only.
5. Install the new launcher build on two verified accounts and accept a friend request. Both users must open Social in the updated launcher once to register their encryption public keys.
6. Click a friend in the right sidebar, or open Social and select a friend. Send and reply, refresh, and check older history.
7. Open **Encryption → Messaging encryption & recovery**, choose a strong recovery passphrase of at least 12 characters, and save the encrypted recovery file. Keep the file and passphrase safe. To move to another Windows PC, sign in, enter the same passphrase and select **Restore from file**.
8. Compare the conversation's security code with your friend in person or through another trusted channel before relying on the identity of the other endpoint.

No Edge Function deployment or Realtime publication change is needed. Existing Supabase public URL/key settings remain unchanged. Never put a service-role key, messaging private key or recovery passphrase in GitHub/Vercel environment variables.

Older launcher builds cannot send after the encryption migration. They fail closed; there is no plain-text sending fallback.

## Encryption

- Message content uses RustCrypto `crypto_box` 0.9.1: X25519 key agreement and XSalsa20-Poly1305 authenticated encryption with random 24-byte nonces. The authenticated encrypted content binds protocol version, sender, recipient and client message ID. Content is encrypted and decrypted in Rust before/after the network call. Only decrypted display text reaches the webview; private keys do not.
- Account private keys and friend public-key pins are stored in Windows Credential Manager, scoped to the Supabase project and Azuria account. Signing out clears displayed messages but retains these keys so signing in again can read history.
- Only public keys and encrypted message contents are uploaded. Keys cannot be overwritten through the public API. First-seen friend keys are pinned locally; unexpected changes stop messaging. Security-code comparison is needed to verify the initial key exchange independently of the server. Restoring on a new PC establishes new local pins, so verify codes again.
- Recovery files contain only an encrypted private key. Backup version 1 uses Argon2id v1.3 (19,456 KiB, two iterations, one lane, 32-byte output), a random 16-byte salt and XChaCha20-Poly1305 with a random 24-byte nonce; the account ID is authenticated. The passphrase is not stored or uploaded. Restore rejects another account, incorrect passphrases, changed files and keys that do not match the registered public key.
- There is no silent key reset. A new PC must restore the existing key. Losing both the local key and a usable recovery file prevents using that encrypted identity; administrators cannot restore it. Account key rotation and automatic multi-device key distribution are not implemented.
- This static-key protocol does **not** provide forward secrecy or post-compromise recovery. Compromised private keys can expose retained encrypted history. It is not the Signal protocol and has not received an independent security audit.
- Encryption does not conceal participants, timestamps, message lengths, read markers or request metadata. The server can still delay, withhold or reorder messages. A compromised app/PC or either participant can access plaintext. Key pinning does not by itself authenticate the first server-supplied key.
- Existing plain-text rows are preserved, labelled **Older message · Not end-to-end encrypted**, and never described as retroactively encrypted. The migration does not delete history or remove plain text from old backups/logs. New sends always use the encrypted RPC. Message verification failures show a placeholder instead of unauthenticated text.

## Behaviour and access controls

- Text only, up to 2,000 characters locally; 30 new messages per sender per minute. The server bounds ciphertext size and validates its envelope; it cannot inspect encrypted content.
- Accepted friends can read their shared history. Removing or blocking a friend revokes API access and sending in both directions. Restoring the friendship restores retained history with the same keys. Previously received messages cannot be remotely erased from a recipient's device.
- History loads 50 messages at a time; read markers apply through the newest fetched message.
- Opening Social loads recent conversations and unread counts. While Social is visible and the app is visible it refreshes every 15 seconds. Other pages and hidden app windows do not poll. The Chats list shows the most recent 200 conversations; Friends can open older conversations. There are no background push notifications, typing indicators or online-status claims.
- Failed sends keep the draft. Retrying unchanged text uses the same client ID; the server returns the original encrypted row without overwriting it, and the native client decrypts and verifies that it matches the draft before confirming success.
- Display text is rendered as plain text. HTML and links are not executed.
- Deleting an account cascades its public key and messages. There is no automatic retention expiry or individual message deletion in this version.
- The database derives the sender from the verified JWT, checks friendship and blocks on every conversation request, and denies authenticated clients direct access to messages and key tables. Pair locks serialize sends with blocking/removal. No message text, private keys, recovery passphrases or tokens are logged by this feature.

## Checks

- `cargo test --locked --manifest-path packages/azuria-auth/Cargo.toml`: encryption round trips, wrong keys, non-contributory public keys, tampering, context substitution, nonce generation, fingerprints, protected backup and restore, plus existing auth tests.
- `node --test apps/accounts/frontend/tests/message-encryption.test.mjs`: migrations with PGlite, key access and immutability, rejection of plaintext/invalid ciphertext, retries, blocks and deletion.
- Existing messaging tests cover access control, pagination, unread markers, retry handling, session isolation and the launcher UI.
