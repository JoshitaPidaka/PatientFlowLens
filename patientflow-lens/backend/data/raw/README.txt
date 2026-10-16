HEALTH — THE FORGOTTEN PATIENT
Synthetic educational dataset created for DATATHON. It is not real patient data and must not be used for clinical decisions.
Files: patients.csv (2,000), encounters.csv (8,000), departments.csv (12), diagnostic_tests.csv (5,000).
Join keys: patients.patient_id = encounters.patient_id; departments.department_id = encounters.department_id; diagnostic_tests.encounter_id = encounters.encounter_id.
Timestamp fields are synthetic. Wait and service duration fields are included for analysis; teams should check data quality and avoid treating synthetic associations as clinical truth.
