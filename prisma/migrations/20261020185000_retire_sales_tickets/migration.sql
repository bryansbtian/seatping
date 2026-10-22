UPDATE "tickets"
SET "type" = 'feedback',
    "data" = (
      CASE
        WHEN jsonb_typeof("data") = 'object' THEN "data"
        ELSE jsonb_build_object('legacyData', "data")
      END
    ) || '{"feedbackType":"support"}'::jsonb,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "type" = 'sales';
