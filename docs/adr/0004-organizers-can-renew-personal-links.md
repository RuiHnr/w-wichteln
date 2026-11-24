# Organizers can renew any participant's Personal Link

A participant who loses their Personal Link cannot get back into the group (ADR 0002). Any organizer can therefore create a new Personal Link for any participant. Because only a hash of each token is stored, the old link cannot be shown again: renewal issues a new token and the old one stops working on every device.

This weakens ADR 0003. An organizer who renews someone's link can open it and see that participant's recipient. We accept this between friends and make it visible instead: every participant sees who renewed whose link and when, and the affected participant notices because their old link stops working.

## Considered Options

- **Store tokens readably so organizers can show the existing link**: a leaked database would hand out every Personal Link.
- **Allow renewal only while the group is open**: it fails exactly when it matters most, after the draw.
- **Renewal without a visible trace**: misuse would go unnoticed.
