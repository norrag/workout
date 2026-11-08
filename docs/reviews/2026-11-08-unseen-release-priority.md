# Unseen release priority

The owner reported that releasing 1.4 immediately after 1.3 obscured the
measurements announcement. The server gate already accumulates every unseen
feature release; the defect was presentation: newest-first entries and the
newest headline led with the smaller connector update.

The announcement now leads with unseen entries marked featured, followed by
other highlights in newest-release order. Its headline comes from the newest
unseen release containing a featured highlight. The 1.3 measurements feature
therefore leads when both 1.3 and 1.4 are pending. Users who acknowledged 1.3
still see only 1.4. No profile versions or measurement data are reset or changed.
This amends the announcement ordering in doc23 section6 and the release design.

Version1.4.1 is a quiet fix, not another announcement. Tests cover actual registry
selection for last-seen1.2.1,1.3,1.4 and a new account, plus the browser's first
entry/headline and persistence after dismissal. The existing dialog dimensions,
small supporting type and flagship hierarchy remain unchanged.
