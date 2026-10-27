# Safety, privacy and limitations — ResultTrail

## Rule compliance

- Nonpartisan demonstration; no persuasion, microtargeting or eligibility decision.
- Only fictional records are accepted by the current application workflow. No live electoral system has been accessed or tested for this project.
- Human reviewers make decisions. Automated checks never assert fraud or an official result.
- Winning or participation would not authorise operational deployment.

## Risks and controls

| Risk | Current control | Remaining limit |
|---|---|---|
| Inaccurate figures or false accusation | Source comparison, arithmetic prompts, human review, correction versions | A reviewer may still err; a hash cannot prove the source is true |
| Reporter identity or location exposure | Assigned aliases instead of legal names; no GPS collection; reviewer-only map and image access | Source notes/images or shared accounts can reveal identities |
| Lost offline work | Encrypted local queue and draft restore | Browser eviction, disk loss or forgotten passphrase can destroy unsynced data |
| Device compromise | AES-GCM local encryption and separate passphrase | Malware or an unlocked device can expose data |
| Over-reliance on a receipt | Receipt covers canonical payload digest and server receive time | It proves server acceptance, not paper-source authenticity |
| Model errors | Experimental anomaly model disabled after failed evaluation gate | Deterministic checks can miss context-dependent errors |

## Privacy and retention

The app asks for an assigned alias and fictional report data, not a legal name, phone number or live location. Reporter account access and reviewer tenant access are enforced by the server. Reporters can remove local encrypted copies. Hosted records and backups have no automatic expiry or self-service deletion yet; deletion requires an operator process. [Full retention note](privacy-and-retention.md).

## Conditions for further testing

Real-world use would require explicit authorisation, a written retention and deletion policy, consent and safeguarding review, independent security testing, accessibility testing with users, reliable backups, and source-authenticity research. This prototype is not approved for operational electoral deployment.
