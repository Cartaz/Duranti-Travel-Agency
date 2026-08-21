# Reservation date entry

Reservation blocks belong to one travel day. Their start date is therefore not a free-form value: the UI fixes it to the owning day and asks the user only for the start time.

The end remains optional and may be on the same day or a later day, up to the trip return date when one is defined. End date and end time are entered separately so mobile browsers do not have to explain a compound `datetime-local` constraint.

The UI prevents common invalid states:

- the start date cannot differ from the owning day;
- an end cannot be entered before a start time exists;
- the end date cannot be before the owning day;
- the end date cannot exceed the trip return date;
- for same-day reservations, the end time cannot be earlier than the start time.

Service validation remains authoritative and its errors include the conflicting dates/times and the allowed boundary. This preserves data integrity for legacy callers while making ordinary UI use prevention-first rather than error-first.
