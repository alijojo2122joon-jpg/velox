-- Campus rentals: an owner can reserve a listing near a university for that university's students only.
-- Booking such a listing requires an approved student card (KTM) for the same university.
ALTER TABLE vehicles ADD COLUMN students_only INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_vehicles_students_only ON vehicles(university_id, students_only);
