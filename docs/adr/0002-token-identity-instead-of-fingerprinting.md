# Identify participants by a stored token and a personal link

Participants are recognised by a random token kept in the browser's localStorage. A personal link carrying the same token restores identity on another device or after the browser data is cleared. We rejected browser fingerprinting because browser updates, private windows and device changes break it, and it is invasive. We rejected accounts with passwords because they are too much friction for a group of friends.

## Consequences

Anyone who has a participant's personal link can act as that participant. The UI must tell people to keep their link private.
