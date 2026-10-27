# Reporter safety and retention in the demonstration

ResultTrail is a controlled, fictional research demonstration. Account aliases are assigned by a coordinator; the site does not ask for a legal name, phone number, live GPS location or personal identification. The polling-unit location is entered from the illustrative result copy. Reporters should not put personal details or accusations in source notes or images.

## Who can see what

- A reporter can see their own hosted reports and review feedback. An encrypted unsent draft or queue stays in that browser's IndexedDB until it is synced or removed.
- Assigned reviewers in the same project can see received reports, source images and precise polling-unit locations. The geographic explorer is inside the reviewer workspace; there is no public report map or public result endpoint.
- The service operator can access the Cloudflare D1 database and backups. Sharing a reporter account shares access to that account's hosted records.

## Deletion and retention

- **On this device:** the reporter can remove an individual encrypted local copy from the Records screen. An unsent record removed this way cannot be recovered. A received record remains on the hosted service after its local copy is removed. The browser's site-data controls can also erase the whole local vault, drafts and queue.
- **On the hosted service:** result versions, receipts, images and review actions are retained for the duration of the controlled demonstration. There is no automatic expiry or self-service hosted deletion yet. A coordinator can arrange deletion with the operator; the operator must also address database exports and backup copies. A previously downloaded signed receipt or export cannot be remotely recalled.
- **Backups:** private database exports are separate from the live service. Deletion from D1 alone does not remove a prior export. The backup procedure and private file locations are in `cloud/README.md`.

The user interface does not promise anonymity or complete deletion. Before use with real people or real electoral records, the project needs a written retention period, a tested hosted deletion workflow, independent privacy and security review, and appropriate authorisation.
