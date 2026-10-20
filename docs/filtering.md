# Filtering and matching

The pure engine in `shared/filter.ts` combines OR within each facet and AND across facets. Blank filters retain every imported record, including unknown dates, undated postings and expired entries. Search covers company, title and available description. Posting recency and newest/oldest sorting use the displayed source posting date, not internship start or collection time. Relevance ranks compatibility, optionally software-oriented titles/categories, then posting date; it is our heuristic.

Each start/end fact retains YYYY, YYYY-MM or YYYY-MM-DD precision, certainty, evidence and explicit flexibility. Coarse dates are compared with conservative bounds. Date/month filters match possible intersection. Missing dates are not flexible. Separate switches retain unknown dates and durations in comparisons. Reset all returns all listings; Reset dates preserves the ordinary search facets.

Advertised durations retain minimum, maximum, unit and qualifier. Minimum-only facts have an open upper bound; maximum-only facts start at zero. Duration filters use interval intersection: a three-to-six-month range can match six, and a three-month minimum does not rule out twelve. Neither proves a twelve-month offer.

Calendar arithmetic anchors on the actual day, clamps month ends and handles leap years. Fractional months use adjacent anchored month lengths. Exact start/end dates can supply a calculated filter duration without overwriting the advertised fact. Week/day commitments need a precise date anchor for month conversion; otherwise month duration remains unknown. End dates are endpoints, so May 1–April 30 is approximately twelve calendar months.

Reversed dates or exact dates inconsistent with duration prevent confirmation. Seven days of tolerance accommodates inclusive endpoints and approximate programme wording. Preferred duration is not a mandatory bound. Conflicts are shown for human review, never silently repaired.

- **Confirmed compatible:** verified facts with supporting evidence guarantee full required-period coverage, without conflict.
- **Potentially compatible:** reported/coarse dates could cover the period, or explicit flexibility needs confirmation.
- **Incompatible:** known dates or maximum duration prevent full coverage. Outside and partial overlaps are distinguished.
- **Insufficient information:** missing boundaries or conflicting evidence prevent assessment.

Relationship and certainty are separate. Unknown relationships can remain in date comparisons with the unknown-date switch; disable it for strict geometry. The personal preset starts inactive. It uses Singapore, 1 May 2027–30 April 2028, roughly 11–13 months, software priority and confirmed/potential/unknown statuses. Deactivation restores previous filters. The preset is editable/removable; no record is permanently excluded.
