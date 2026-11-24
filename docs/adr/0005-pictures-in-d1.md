# Store pictures in D1, not in R2

Group Pictures and Participant Pictures are stored as blobs in a D1 table, next to the rest of the group's data. R2 would be the natural home for images, but enabling it on the Cloudflare account requires a payment method, and we want the app to run on the free plan without one. Pictures are small (scaled to 1024 px in the browser, at most 1 MB), so they fit within D1's row limit, and the free 5 GB is plenty for groups of friends that expire 60 days after their Exchange Date.

## Consequences

- The database grows with every picture, and every picture request reads from D1.
- A picture belongs to its group in the database, so Expiry and Group Deletion remove it with everything else, and replacing or removing a picture happens in the same transaction as the change to its group or participant. No image is ever left behind without its owner.

## Considered Options

- **R2**: cheaper per byte and built for files, but needs a payment method on the account. Moving to it later means copying the blobs over and changing where pictures are read from.
