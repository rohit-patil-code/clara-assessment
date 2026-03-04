# Onboarding Updates Log

### business_hours
- **Old Value**: Monday through Friday, 8:00 AM to 5:00 PM (EST)
- **New Value**: Monday-Friday 8:00 AM to 5:00 PM CST
- **Reason**: Client confirmed specific time zone with updated business hours.

### office_address
- **Old Value**: *null*
- **New Value**: 123 Main Street, Suite 400, Chicago, Illinois
- **Reason**: Client provided primary office address.

### integration_constraints
- **Old Value**: *null*
- **New Value**: ServiceTitan. In ServiceTitan, create job tickets for actual emergencies only, and log details as customer notes for non-emergency standard maintenance after-hours.
- **Reason**: Client specified strict integration rules based on industry.

### call_transfer_rules
- **Old Value**: Calls are transferred after one-minute hold for emergency situations. Otherwise, flow might be dependent on dispatch protocols, which are not explicitly mentioned in the transcript
- **New Value**: 30-second timeout. Fallback: 'I am paging our backup emergency team right now, and someone will call you back within 10 minutes.'
- **Reason**: Client specified timeout and fallback message for emergency call transfers.

