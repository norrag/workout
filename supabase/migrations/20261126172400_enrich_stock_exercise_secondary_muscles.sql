-- Approved exercise-library audit: 170 stock exercises, 205 secondary links.
-- Stock is keyed by legacy_id across environments. Do not rewrite exercise IDs,
-- existing muscle links, workout plans, or logged training data.
do $audit$
declare
  line record;
  exercise_uuid uuid;
  muscle_uuid uuid;
  current_name text;
  actual_primary text[];
  actual_secondary text[];
  final_secondary text[];
  muscle text;
begin
  lock table public.exercise_muscle_groups in share row exclusive mode;
  for line in
    select * from (values
      (1, 'Arnold Press', array['shoulders']::text[], array[]::text[], array['triceps']::text[]),
      (2, 'Assisted Dip', array['triceps']::text[], array[]::text[], array['chest']::text[]),
      (3, 'Assisted Pullup (Normal Grip)', array['back']::text[], array[]::text[], array['biceps']::text[]),
      (4, 'Assisted Pullup (Parallel Grip)', array['back']::text[], array[]::text[], array['biceps']::text[]),
      (5, 'Back Raise (45 degree)', array['hamstrings']::text[], array[]::text[], array['glutes']::text[]),
      (6, 'Back Raise (45 Degree)', array['hamstrings']::text[], array[]::text[], array['glutes']::text[]),
      (10, 'Barbell Split Squat', array['quads']::text[], array[]::text[], array['glutes']::text[]),
      (11, 'Barbell Squat (Close Stance, Feet Forward)', array['quads']::text[], array[]::text[], array['glutes']::text[]),
      (12, 'Barbell Squat (Heel Elevated)', array['quads']::text[], array[]::text[], array['glutes']::text[]),
      (15, 'Barbell Squat (Sumo Stance)', array['glutes']::text[], array[]::text[], array['quads']::text[]),
      (17, 'Belt Squat (Wide Stance)', array['glutes']::text[], array[]::text[], array['quads']::text[]),
      (18, 'Bench Press (Incline, Medium Grip)', array['chest']::text[], array['triceps']::text[], array['shoulders']::text[]),
      (19, 'Bench Press (Medium Grip)', array['chest']::text[], array['triceps']::text[], array['shoulders']::text[]),
      (26, 'Cable Hammer Curl (Rope)', array['biceps']::text[], array[]::text[], array['forearms']::text[]),
      (31, 'Cable Rope Facepull', array['shoulders']::text[], array[]::text[], array['traps']::text[]),
      (38, 'Cable Upright Row', array['shoulders']::text[], array[]::text[], array['traps']::text[]),
      (41, 'Chest Supported Row', array['back']::text[], array[]::text[], array['biceps']::text[]),
      (42, 'Barbell Bent Over Shrug', array['traps']::text[], array[]::text[], array['back']::text[]),
      (43, 'Deadlift (Deficit)', array['glutes']::text[], array[]::text[], array['hamstrings', 'quads']::text[]),
      (44, 'Dip (Triceps-Focused)', array['triceps']::text[], array[]::text[], array['chest']::text[]),
      (45, 'Dip (Weighted, Triceps-Focused)', array['triceps']::text[], array[]::text[], array['chest']::text[]),
      (55, 'Dumbbell Lateral Raise (Super ROM)', array['shoulders']::text[], array[]::text[], array['traps']::text[]),
      (58, 'Dumbbell Press (Flat)', array['chest']::text[], array['triceps']::text[], array['shoulders']::text[]),
      (60, 'Dumbbell Press (Low Incline)', array['chest']::text[], array[]::text[], array['shoulders', 'triceps']::text[]),
      (61, 'Dumbbell Press (Medium Incline)', array['chest']::text[], array['shoulders']::text[], array['triceps']::text[]),
      (65, 'Dumbbell Row (2-Arm, Incline)', array['back']::text[], array[]::text[], array['biceps']::text[]),
      (67, 'Dumbbell Row to Hips', array['back']::text[], array[]::text[], array['biceps']::text[]),
      (68, 'Dumbbell Shoulder Press (Seated)', array['shoulders']::text[], array[]::text[], array['triceps']::text[]),
      (71, 'Dumbbell Split Squat', array['glutes']::text[], array[]::text[], array['quads']::text[]),
      (72, 'Dumbbell Stiff Legged Deadlift', array['hamstrings']::text[], array[]::text[], array['glutes']::text[]),
      (73, 'Dumbbell Upright Row', array['shoulders']::text[], array[]::text[], array['traps']::text[]),
      (74, 'Dumbbell Y-Raise', array['shoulders']::text[], array[]::text[], array['traps']::text[]),
      (75, 'Dumbbell Y-Raise (seated)', array['shoulders']::text[], array[]::text[], array['traps']::text[]),
      (81, 'Cable Bent Over Shrug', array['traps']::text[], array[]::text[], array['back']::text[]),
      (82, 'Hammer Curl', array['biceps']::text[], array[]::text[], array['forearms']::text[]),
      (83, 'Hammer Machine Chest Press (Flat)', array['chest']::text[], array['triceps']::text[], array['shoulders']::text[]),
      (84, 'Hammer Machine Row (High)', array['back']::text[], array[]::text[], array['biceps']::text[]),
      (85, 'Hammer Machine Row (Low)', array['back']::text[], array[]::text[], array['biceps']::text[]),
      (89, 'Leg Press (Watson Split Leg Press)', array['quads']::text[], array[]::text[], array['glutes']::text[]),
      (94, 'Machine Chest Press', array['chest']::text[], array[]::text[], array['shoulders', 'triceps']::text[]),
      (95, 'Machine Chest Press (Incline)', array['chest']::text[], array[]::text[], array['shoulders', 'triceps']::text[]),
      (103, 'Machine Low Row', array['back']::text[], array[]::text[], array['biceps']::text[]),
      (104, 'Machine Mid Row', array['back']::text[], array[]::text[], array['biceps']::text[]),
      (110, 'Machine Shoulder Press', array['shoulders']::text[], array[]::text[], array['triceps']::text[]),
      (114, 'MaxPump Hip Press (Single Leg)', array['glutes']::text[], array[]::text[], array['quads']::text[]),
      (115, 'MaxPump Incline Press', array['chest']::text[], array[]::text[], array['shoulders', 'triceps']::text[]),
      (116, 'MaxPump Seated Multi High Row (Single Arm)', array['back']::text[], array[]::text[], array['biceps']::text[]),
      (118, 'Pendulum Squat', array['quads']::text[], array[]::text[], array['glutes']::text[]),
      (119, 'Power Squat', array['quads']::text[], array[]::text[], array['glutes']::text[]),
      (120, 'Pull Down (Mag Grip)', array['back']::text[], array[]::text[], array['biceps']::text[]),
      (122, 'Pulldown (Parallel Grip)', array['back']::text[], array[]::text[], array['biceps']::text[]),
      (124, 'Pulldown (Wide Grip)', array['back']::text[], array[]::text[], array['biceps']::text[]),
      (125, 'Pullup (Weighted, Normal Grip)', array['back']::text[], array[]::text[], array['biceps']::text[]),
      (126, 'Pushup', array['chest']::text[], array['triceps']::text[], array['shoulders']::text[]),
      (128, 'Reverse Lunge (Barbell)', array['glutes']::text[], array[]::text[], array['quads']::text[]),
      (130, 'Seated Cable Row', array['back']::text[], array[]::text[], array['biceps']::text[]),
      (135, 'Slope squat', array['quads']::text[], array[]::text[], array['glutes']::text[]),
      (136, 'Smith Machine Bench Press (Medium Grip)', array['chest']::text[], array[]::text[], array['shoulders', 'triceps']::text[]),
      (138, 'Smith Machine Good Morning', array['hamstrings']::text[], array[]::text[], array['glutes']::text[]),
      (139, 'Smith Machine Shoulder Press (Seated)', array['shoulders']::text[], array[]::text[], array['triceps']::text[]),
      (141, 'Smith Machine Squat (Feet Forward)', array['quads']::text[], array[]::text[], array['glutes']::text[]),
      (144, 'Standing Shoulder Press (Machine)', array['shoulders']::text[], array[]::text[], array['triceps']::text[]),
      (145, 'StIff Leg Deadlift', array['hamstrings']::text[], array[]::text[], array['glutes']::text[]),
      (148, 'Walking Lunges (Glute-Focused, Barbell)', array['glutes']::text[], array[]::text[], array['quads']::text[]),
      (149, 'Walking Lunges (Glute-Focused, Bodyweight)', array['glutes']::text[], array[]::text[], array['quads']::text[]),
      (152, 'Assisted Pullup (Underhand Grip)', array['back']::text[], array[]::text[], array['biceps']::text[]),
      (153, 'Assisted Pullup (Wide Grip)', array['back']::text[], array[]::text[], array['biceps']::text[]),
      (156, 'Back Raise (Glute Ham Deck)', array['hamstrings']::text[], array[]::text[], array['glutes']::text[]),
      (157, 'Barbell Bent Over Row', array['back']::text[], array[]::text[], array['biceps']::text[]),
      (161, 'Barbell Facepull', array['shoulders']::text[], array[]::text[], array['traps']::text[]),
      (162, 'Barbell Flexion Row', array['back']::text[], array[]::text[], array['biceps']::text[]),
      (166, 'Barbell Good Morning (Cambered Bar)', array['hamstrings']::text[], array[]::text[], array['glutes']::text[]),
      (167, 'Barbell Good Morning (High Bar)', array['hamstrings']::text[], array[]::text[], array['glutes']::text[]),
      (168, 'Barbell Good Morning (Low Bar)', array['hamstrings']::text[], array[]::text[], array['glutes']::text[]),
      (169, 'Barbell Good Morning (Safety Bar)', array['hamstrings']::text[], array[]::text[], array['glutes']::text[]),
      (172, 'Barbell Row to Chest', array['back']::text[], array[]::text[], array['biceps']::text[]),
      (173, 'Barbell Shoulder Press (Seated)', array['shoulders']::text[], array[]::text[], array['triceps']::text[]),
      (174, 'Barbell Shoulder Press (Standing)', array['shoulders']::text[], array[]::text[], array['triceps']::text[]),
      (176, 'Barbell Squat (Cambered Bar)', array['quads']::text[], array[]::text[], array['glutes']::text[]),
      (177, 'Barbell Squat (Safety Bar)', array['quads']::text[], array[]::text[], array['glutes']::text[]),
      (179, 'Barbell Upright Row', array['shoulders']::text[], array[]::text[], array['traps']::text[]),
      (182, 'Bench Press (Cambered Bar)', array['chest']::text[], array[]::text[], array['shoulders', 'triceps']::text[]),
      (183, 'Bench Press (Close Grip)', array['triceps']::text[], array[]::text[], array['chest', 'shoulders']::text[]),
      (184, 'Bench Press (Decline)', array['chest']::text[], array[]::text[], array['shoulders', 'triceps']::text[]),
      (185, 'Bench Press (Incline, Narrow Grip)', array['chest']::text[], array[]::text[], array['shoulders', 'triceps']::text[]),
      (186, 'Bench Press (Incline, Wide Grip)', array['chest']::text[], array[]::text[], array['shoulders', 'triceps']::text[]),
      (187, 'Bench Press (Narrow Grip)', array['chest']::text[], array[]::text[], array['shoulders', 'triceps']::text[]),
      (188, 'Bench Press (Wide Grip)', array['chest']::text[], array[]::text[], array['shoulders', 'triceps']::text[]),
      (189, 'Bodyweight Squat (2/3)', array['quads']::text[], array[]::text[], array['glutes']::text[]),
      (190, 'Bulgarian Split Squat (Glute-Focused)', array['glutes']::text[], array[]::text[], array['quads']::text[]),
      (191, 'Bulgarian Split Squat (Quad-Focused)', array['quads']::text[], array[]::text[], array['glutes']::text[]),
      (192, 'Deadlift', array['glutes']::text[], array['hamstrings']::text[], array['quads']::text[]),
      (193, 'Cable Chest Press', array['chest']::text[], array[]::text[], array['shoulders', 'triceps']::text[]),
      (199, 'Cable Flexion Row', array['back']::text[], array[]::text[], array['biceps']::text[]),
      (204, 'Cable Pull Through', array['glutes']::text[], array[]::text[], array['hamstrings']::text[]),
      (207, 'Cable Rope Facepull (Kneeling)', array['shoulders']::text[], array[]::text[], array['traps']::text[]),
      (208, 'Dumbbell Bent Over Shrug', array['traps']::text[], array[]::text[], array['back']::text[]),
      (211, 'Dumbbell Press (High Incline)', array['shoulders']::text[], array[]::text[], array['chest', 'triceps']::text[]),
      (213, 'Cambered Bar Row', array['back']::text[], array[]::text[], array['biceps']::text[]),
      (216, 'Deadlift (Deficit 25''s)', array['glutes']::text[], array[]::text[], array['hamstrings', 'quads']::text[]),
      (218, 'Deadlift (Sumo Stance)', array['glutes']::text[], array[]::text[], array['hamstrings', 'quads']::text[]),
      (219, 'Deadlift (Sumo Stance, Deficit)', array['glutes']::text[], array[]::text[], array['hamstrings', 'quads']::text[]),
      (221, 'Dip (Chest-Focused)', array['chest']::text[], array[]::text[], array['triceps']::text[]),
      (222, 'Dip (Weighted, Chest-Focused)', array['chest']::text[], array[]::text[], array['triceps']::text[]),
      (223, 'Dip Machine', array['triceps']::text[], array[]::text[], array['chest']::text[]),
      (226, 'Dumbbbell Flexion Row', array['back']::text[], array[]::text[], array['biceps']::text[]),
      (228, 'Hack Squat', array['glutes']::text[], array[]::text[], array['quads']::text[]),
      (229, 'Dumbbell Facepull', array['shoulders']::text[], array[]::text[], array['traps']::text[]),
      (230, 'Dumbbell Facepull (Incline)', array['shoulders']::text[], array[]::text[], array['traps']::text[]),
      (231, 'Dumbbell Front Squat', array['quads']::text[], array[]::text[], array['glutes']::text[]),
      (236, 'Hack Squat', array['quads']::text[], array[]::text[], array['glutes']::text[]),
      (241, 'Dumbbell Shoulder Press (Standing)', array['shoulders']::text[], array[]::text[], array['triceps']::text[]),
      (242, 'Smith Machine Split Squat', array['quads']::text[], array[]::text[], array['glutes']::text[]),
      (248, 'EZ Bar Row (Underhand)', array['back']::text[], array[]::text[], array['biceps']::text[]),
      (256, 'Freemotion Y-Raises', array['shoulders']::text[], array[]::text[], array['traps']::text[]),
      (257, 'Freemotion Y-Raises (Paused)', array['shoulders']::text[], array[]::text[], array['traps']::text[]),
      (258, 'Front Foot Elevated Smith Lunge', array['glutes']::text[], array[]::text[], array['quads']::text[]),
      (259, 'Front Squat', array['quads']::text[], array[]::text[], array['glutes']::text[]),
      (260, 'Front Squat (Cross Grip)', array['quads']::text[], array[]::text[], array['glutes']::text[]),
      (261, 'Goblet Squat', array['quads']::text[], array[]::text[], array['glutes']::text[]),
      (263, 'Hammer Machine Chest Press (Incline)', array['chest']::text[], array[]::text[], array['shoulders', 'triceps']::text[]),
      (264, 'Hammer Preacher Curl', array['biceps']::text[], array[]::text[], array['forearms']::text[]),
      (269, 'Inverted Row', array['back']::text[], array[]::text[], array['biceps']::text[]),
      (271, 'JM Press', array['triceps']::text[], array[]::text[], array['chest']::text[]),
      (272, 'Landmine Row', array['back']::text[], array[]::text[], array['biceps']::text[]),
      (276, 'Meadows Row', array['back']::text[], array[]::text[], array['biceps']::text[]),
      (280, 'Pulldown (Narrow Grip)', array['back']::text[], array[]::text[], array['biceps']::text[]),
      (281, 'Pulldown (Single-Arm)', array['back']::text[], array[]::text[], array['biceps']::text[]),
      (282, 'Pulldown (Underhand Grip)', array['back']::text[], array[]::text[], array['biceps']::text[]),
      (283, 'Pulldown (Upright Torso to Abs)', array['back']::text[], array[]::text[], array['biceps']::text[]),
      (284, 'Pullup (Normal Grip)', array['back']::text[], array[]::text[], array['biceps']::text[]),
      (285, 'Pullup (Parallel Grip)', array['back']::text[], array[]::text[], array['biceps']::text[]),
      (286, 'Pullup (Underhand Grip)', array['back']::text[], array[]::text[], array['biceps']::text[]),
      (287, 'Pullup (Weighted, Parallel Grip)', array['back']::text[], array[]::text[], array['biceps']::text[]),
      (288, 'Pullup (Weighted, Underhand Grip)', array['back']::text[], array[]::text[], array['biceps']::text[]),
      (289, 'Pullup (Weighted, Wide Grip)', array['back']::text[], array[]::text[], array['biceps']::text[]),
      (290, 'Pullup (Wide Grip)', array['back']::text[], array[]::text[], array['biceps']::text[]),
      (291, 'Pushup (Deficit)', array['chest']::text[], array[]::text[], array['shoulders', 'triceps']::text[]),
      (292, 'Pushup (Narrow Grip)', array['chest']::text[], array[]::text[], array['shoulders', 'triceps']::text[]),
      (293, 'Pushup (Weighted, Narrow Grip)', array['chest']::text[], array[]::text[], array['shoulders', 'triceps']::text[]),
      (294, 'Pushup (Weighted, Normal Grip)', array['chest']::text[], array[]::text[], array['shoulders', 'triceps']::text[]),
      (296, 'Reverse Curl', array['forearms']::text[], array[]::text[], array['biceps']::text[]),
      (297, 'Reverse Hyper', array['glutes']::text[], array[]::text[], array['hamstrings']::text[]),
      (298, 'Reverse Lunge (Dumbbell)', array['glutes']::text[], array[]::text[], array['quads']::text[]),
      (299, 'Rogers Good Morning', array['hamstrings']::text[], array[]::text[], array['glutes']::text[]),
      (300, 'Rogers Reverse Lunge', array['glutes']::text[], array[]::text[], array['quads']::text[]),
      (301, 'Rogers Squat', array['quads']::text[], array[]::text[], array['glutes']::text[]),
      (302, 'Seal Row', array['back']::text[], array[]::text[], array['biceps']::text[]),
      (303, 'Seated Cable Row (Single-Arm)', array['back']::text[], array[]::text[], array['biceps']::text[]),
      (304, 'Single Leg Press', array['quads']::text[], array[]::text[], array['glutes']::text[]),
      (305, 'Single Leg Romanian Deadlift', array['hamstrings']::text[], array[]::text[], array['glutes']::text[]),
      (308, 'Smith Machine Bench Press (Narrow Grip)', array['chest']::text[], array[]::text[], array['shoulders', 'triceps']::text[]),
      (309, 'Smith Machine Bench Press (Wide Grip)', array['chest']::text[], array[]::text[], array['shoulders', 'triceps']::text[]),
      (310, 'Smith Machine JM Press', array['triceps']::text[], array[]::text[], array['chest']::text[]),
      (311, 'Smith Machine Press (High Incline, Medium Grip)', array['chest']::text[], array[]::text[], array['shoulders', 'triceps']::text[]),
      (312, 'Smith Machine Press (High Incline, Narrow Grip)', array['chest']::text[], array[]::text[], array['shoulders', 'triceps']::text[]),
      (313, 'Smith Machine Press (High Incline, Wide Grip)', array['chest']::text[], array[]::text[], array['shoulders', 'triceps']::text[]),
      (314, 'Smith Machine Press (Incline, Medium Grip)', array['chest']::text[], array[]::text[], array['shoulders', 'triceps']::text[]),
      (315, 'Smith Machine Press (Incline, Wide Grip)', array['chest']::text[], array[]::text[], array['shoulders', 'triceps']::text[]),
      (316, 'Smith Machine Press (Low Incline, Medium Grip)', array['chest']::text[], array[]::text[], array['shoulders', 'triceps']::text[]),
      (317, 'Smith Machine Press (Low Incline, Narrow Grip)', array['chest']::text[], array[]::text[], array['shoulders', 'triceps']::text[]),
      (318, 'Smith Machine Press (Low Incline, Wide Grip)', array['chest']::text[], array[]::text[], array['shoulders', 'triceps']::text[]),
      (319, 'Smith Machine Press (Medium Incline, Narrow Grip)', array['chest']::text[], array[]::text[], array['shoulders', 'triceps']::text[]),
      (320, 'Smith Machine Row', array['back']::text[], array[]::text[], array['biceps']::text[]),
      (324, 'Smith Machine Upright Row', array['shoulders']::text[], array[]::text[], array['traps']::text[]),
      (325, 'T-Bar Row', array['back']::text[], array[]::text[], array['biceps']::text[]),
      (326, 'Trap Bar Deadlift', array['glutes']::text[], array[]::text[], array['hamstrings', 'quads']::text[]),
      (328, 'Walking Lunges (Glute-Focused, Dumbbell)', array['glutes']::text[], array[]::text[], array['quads']::text[]),
      (329, 'Walking Lunges (Quad-Focused, Barbell)', array['quads']::text[], array[]::text[], array['glutes']::text[]),
      (330, 'Walking Lunges (Quad-Focused, Dumbbell)', array['quads']::text[], array[]::text[], array['glutes']::text[])
    ) as approved(legacy_id, name, expected_primary, expected_secondary, additions)
  loop
    select e.id, e.name into strict exercise_uuid, current_name from public.exercises e
    where e.user_id is null and e.legacy_id = line.legacy_id;
    if current_name is distinct from line.name then
      raise exception 'Stock exercise name drift for legacy ID %', line.legacy_id;
    end if;
    select coalesce(array_agg(g.name order by g.name) filter (where j.role = 'primary'), array[]::text[]),
           coalesce(array_agg(g.name order by g.name) filter (where j.role = 'secondary'), array[]::text[])
      into actual_primary, actual_secondary
      from public.exercise_muscle_groups j join public.muscle_groups g on g.id = j.muscle_group_id
      where j.exercise_id = exercise_uuid;
    select array_agg(n order by n) into final_secondary
      from unnest(line.expected_secondary || line.additions) as muscles(n);
    if actual_primary is distinct from line.expected_primary or
       (actual_secondary is distinct from line.expected_secondary and actual_secondary is distinct from final_secondary) then
      raise exception 'Muscle assignments drifted for legacy ID %', line.legacy_id;
    end if;
    foreach muscle in array line.additions loop
      select g.id into strict muscle_uuid from public.muscle_groups g where g.name = muscle;
      insert into public.exercise_muscle_groups (exercise_id, muscle_group_id, role)
      values (exercise_uuid, muscle_uuid, 'secondary')
      on conflict (exercise_id, muscle_group_id) do nothing;
    end loop;
  end loop;
end;
$audit$;
