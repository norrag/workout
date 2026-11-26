-- Seed: muscle groups, stock exercises, default engine params.
-- Stock rows have user_id null and are written only here (service context).
-- The stock exercise library is generated from the user-provided export
-- (docs/data/exercises_all_20260615.csv) by scripts/import-exercise-library.py;
-- regenerate the seed with that script; the old import migration is historical.

-- ---------------------------------------------------------------------------
-- muscle groups
-- ---------------------------------------------------------------------------

insert into public.muscle_groups (name) values
  ('chest'), ('back'), ('quads'), ('hamstrings'), ('glutes'), ('biceps'),
  ('triceps'), ('shoulders'), ('calves'), ('abs'), ('forearms'), ('traps')
on conflict (name) do nothing;

-- ---------------------------------------------------------------------------
-- stock exercises (user-provided library; ids preserved in legacy_id)
-- ---------------------------------------------------------------------------

with ex (legacy_id, name, equipment_type, primary_mg, secondary_mg) as (
  values
    (39, 'Calf Machine', 'machine', 'calves', null),
    (131, 'Seated Leg Curl', 'machine', 'hamstrings', null),
    (47, 'Dumbbell Curl (2-Arm)', 'dumbbell', 'biceps', null),
    (35, 'Cable Triceps Pushdown (Bar)', 'cable', 'triceps', null),
    (192, 'Deadlift', 'barbell', 'glutes', 'hamstrings'),
    (88, 'Leg Press', 'machine', 'quads', 'glutes'),
    (87, 'Leg Extension', 'machine', 'quads', null),
    (19, 'Bench Press (Medium Grip)', 'barbell', 'chest', 'triceps'),
    (121, 'Pulldown (Normal Grip)', 'cable', 'back', 'biceps'),
    (98, 'Machine Flye', 'machine', 'chest', null),
    (146, 'Stiff-Legged Deadlift', 'barbell', 'hamstrings', 'glutes'),
    (100, 'Machine Lateral Raise', 'machine', 'shoulders', 'traps'),
    (110, 'Machine Shoulder Press', 'machine', 'shoulders', null),
    (79, 'EZ Bar Preacher Curl', 'barbell', 'biceps', null),
    (236, 'Hack Squat', 'machine', 'quads', null),
    (49, 'Dumbbell Curl (Incline)', 'dumbbell', 'biceps', null),
    (99, 'Machine Glute Kickback', 'machine', 'glutes', null),
    (107, 'Machine Pulldown', 'machine', 'back', 'biceps'),
    (130, 'Seated Cable Row', 'cable', 'back', null),
    (13, 'Barbell Squat (High Bar)', 'barbell', 'quads', 'glutes'),
    (9, 'Barbell Skullcrusher', 'barbell', 'triceps', null),
    (53, 'Dumbbell Lateral Raise', 'dumbbell', 'shoulders', null),
    (29, 'Cable Overhead Triceps Extension', 'cable', 'triceps', null),
    (68, 'Dumbbell Shoulder Press (Seated)', 'dumbbell', 'shoulders', null),
    (30, 'Cable Overhead Triceps Extension (Rope)', 'cable', 'triceps', null),
    (21, 'Cable Curl', 'cable', 'biceps', null),
    (31, 'Cable Rope Facepull', 'cable', 'shoulders', null),
    (58, 'Dumbbell Press (Flat)', 'dumbbell', 'chest', 'triceps'),
    (86, 'Kneeling Hamstring Curl', 'machine', 'hamstrings', null),
    (92, 'Lying Leg Curl', 'machine', 'hamstrings', null),
    (66, 'Dumbbell Row (Single-Arm, Supported)', 'dumbbell', 'back', 'biceps'),
    (61, 'Dumbbell Press (Medium Incline)', 'dumbbell', 'chest', 'shoulders'),
    (36, 'Cable Triceps Pushdown (Rope)', 'cable', 'triceps', null),
    (60, 'Dumbbell Press (Low Incline)', 'dumbbell', 'chest', null),
    (11, 'Barbell Squat (Close Stance, Feet Forward)', 'barbell', 'quads', null),
    (28, 'Cable Leaning Lateral Raise', 'cable', 'shoulders', 'traps'),
    (40, 'Calf Raise - Seated', 'machine', 'calves', null),
    (7, 'Barbell Hip Thrust', 'barbell', 'glutes', 'hamstrings'),
    (83, 'Hammer Machine Chest Press (Flat)', 'machine', 'chest', 'triceps'),
    (237, 'Machine Hip Thrust', 'machine', 'glutes', 'hamstrings'),
    (105, 'Machine Preacher Curl', 'machine', 'biceps', null),
    (18, 'Bench Press (Incline, Medium Grip)', 'barbell', 'chest', 'triceps'),
    (96, 'Machine Chest Supported Row', 'machine', 'back', 'biceps'),
    (67, 'Dumbbell Row to Hips', 'dumbbell', 'back', null),
    (48, 'Dumbbell Curl (Alternating)', 'dumbbell', 'biceps', null),
    (51, 'Dumbbell Flye (Incline)', 'dumbbell', 'chest', null),
    (97, 'Machine Crunch', 'machine', 'abs', null),
    (14, 'Barbell Squat (Narrow Stance)', 'barbell', 'quads', 'glutes'),
    (32, 'Cable Rope Twist Curl', 'cable', 'biceps', null),
    (91, 'Lying Biceps Dumbbell Curl', 'dumbbell', 'biceps', null),
    (90, 'Leg Press Calves', 'machine', 'calves', null),
    (126, 'Pushup', 'bodyweight only', 'chest', 'triceps'),
    (70, 'Dumbbell Skullcrusher', 'dumbbell', 'triceps', null),
    (142, 'Stair Calves', 'bodyweight only', 'calves', null),
    (150, 'Walking Lunges (Quad-Focused, Bodyweight)', 'bodyweight only', 'quads', 'glutes'),
    (85, 'Hammer Machine Row (Low)', 'machine', 'back', null),
    (52, 'Dumbbell Front Raise', 'dumbbell', 'shoulders', null),
    (64, 'Dumbbell Row (2-Arm)', 'dumbbell', 'back', 'biceps'),
    (84, 'Hammer Machine Row (High)', 'machine', 'back', null),
    (6, 'Back Raise (45 Degree)', 'bodyweight loadable', 'hamstrings', null),
    (127, 'Rear Delt Fly', 'machine', 'shoulders', null),
    (211, 'Dumbbell Press (High Incline)', 'dumbbell', 'shoulders', null),
    (128, 'Reverse Lunge (Barbell)', 'barbell', 'glutes', null),
    (147, 'Triceps cable push-down Bar', 'cable', 'triceps', null),
    (50, 'Dumbbell Flye (Flat)', 'dumbbell', 'chest', null),
    (149, 'Walking Lunges (Glute-Focused, Bodyweight)', 'bodyweight only', 'glutes', null),
    (16, 'Belt Squat', 'machine', 'quads', 'glutes'),
    (108, 'Machine Pullover', 'machine', 'back', null),
    (136, 'Smith Machine Bench Press (Medium Grip)', 'smith machine', 'chest', null),
    (15, 'Barbell Squat (Sumo Stance)', 'barbell', 'glutes', null),
    (27, 'Cable Lateral Raise (Single-Arm)', 'cable', 'shoulders', null),
    (38, 'Cable Upright Row', 'cable', 'shoulders', null),
    (63, 'Dumbbell Rotator Cuff Rotation (External)', 'dumbbell', 'shoulders', null),
    (43, 'Deadlift (Deficit)', 'barbell', 'glutes', null),
    (102, 'Machine Leg Extension (MaxPump)', 'machine', 'quads', null),
    (119, 'Power Squat', 'machine', 'quads', null),
    (215, 'Dumbbell Shrug', 'dumbbell', 'traps', null),
    (22, 'Cable Flye', 'cable', 'chest', null),
    (71, 'Dumbbell Split Squat', 'dumbbell', 'glutes', null),
    (54, 'Dumbbell Lateral Raise (Incline)', 'dumbbell', 'shoulders', null),
    (69, 'Dumbbell Shrug (Seated)', 'dumbbell', 'traps', null),
    (57, 'Dumbbell Overhead Extension (Single-Arm)', 'dumbbell', 'triceps', null),
    (134, 'Slant Board Sit-Up (Weighted)', 'bodyweight loadable', 'abs', null),
    (143, 'Stair Calves (Single Leg)', 'bodyweight only', 'calves', null),
    (323, 'Standing Calf Raise', 'machine', 'calves', null),
    (113, 'Machine Triceps Pushdown', 'machine', 'triceps', null),
    (2, 'Assisted Dip', 'machine assistance', 'triceps', null),
    (3, 'Assisted Pullup (Normal Grip)', 'machine assistance', 'back', null),
    (4, 'Assisted Pullup (Parallel Grip)', 'machine assistance', 'back', null),
    (120, 'Pull Down (Mag Grip)', 'cable', 'back', null),
    (94, 'Machine Chest Press', 'machine', 'chest', null),
    (118, 'Pendulum Squat', 'machine', 'quads', null),
    (135, 'Slope squat', 'machine', 'quads', null),
    (141, 'Smith Machine Squat (Feet Forward)', 'smith machine', 'quads', null),
    (122, 'Pulldown (Parallel Grip)', 'cable', 'back', null),
    (20, 'Booty Builder Hip Thrust', 'machine', 'glutes', null),
    (133, 'Single-Leg Leg Curl', 'machine', 'hamstrings', null),
    (10, 'Barbell Split Squat', 'barbell', 'quads', null),
    (109, 'Machine Reverse Flye', 'machine', 'shoulders', null),
    (112, 'Machine Triceps Extension', 'machine', 'triceps', null),
    (137, 'Smith Machine Calves', 'smith machine', 'calves', null),
    (73, 'Dumbbell Upright Row', 'dumbbell', 'shoulders', null),
    (44, 'Dip (Triceps-Focused)', 'bodyweight only', 'triceps', null),
    (111, 'Machine Tricep Overhead Extension (MaxPump)', 'machine', 'triceps', null),
    (80, 'GluteBuilder Hip Thrust', 'machine', 'glutes', null),
    (1, 'Arnold Press', 'dumbbell', 'shoulders', null),
    (59, 'Barbell Shrug', 'barbell', 'traps', null),
    (82, 'Hammer Curl', 'dumbbell', 'biceps', null),
    (23, 'Cable Flye (Bent Over)', 'cable', 'chest', null),
    (62, 'Dumbbell Press Flye (Incline)', 'dumbbell', 'chest', null),
    (41, 'Chest Supported Row', 'machine', 'back', null),
    (65, 'Dumbbell Row (2-Arm, Incline)', 'dumbbell', 'back', null),
    (104, 'Machine Mid Row', 'machine', 'back', null),
    (123, 'Pulldown (Straight Arm)', 'cable', 'back', null),
    (76, 'EZ Bar Curl (Narrow Grip)', 'barbell', 'biceps', null),
    (228, 'Hack Squat', 'smith machine', 'glutes', null),
    (72, 'Dumbbell Stiff Legged Deadlift', 'dumbbell', 'hamstrings', null),
    (138, 'Smith Machine Good Morning', 'smith machine', 'hamstrings', null),
    (12, 'Barbell Squat (Heel Elevated)', 'barbell', 'quads', null),
    (242, 'Smith Machine Split Squat', 'smith machine', 'quads', null),
    (25, 'Cable Front Raise (Underhand)', 'cable', 'shoulders', null),
    (75, 'Dumbbell Y-Raise (seated)', 'dumbbell', 'shoulders', null),
    (101, 'Machine Lateral Raise (MaxPump)', 'machine', 'shoulders', null),
    (139, 'Smith Machine Shoulder Press (Seated)', 'smith machine', 'shoulders', null),
    (77, 'EZ Bar Overhead Triceps Extension', 'barbell', 'triceps', null),
    (116, 'MaxPump Seated Multi High Row (Single Arm)', 'machine', 'back', null),
    (124, 'Pulldown (Wide Grip)', 'cable', 'back', null),
    (125, 'Pullup (Weighted, Normal Grip)', 'bodyweight loadable', 'back', null),
    (129, 'Scapular Retraction - MegaMass Row', 'machine', 'back', null),
    (106, 'Machine Preacher Curl (MaxPump)', 'machine', 'biceps', null),
    (117, 'Pendulum Calves', 'machine', 'calves', null),
    (24, 'Cable Flye (High)', 'cable', 'chest', null),
    (17, 'Belt Squat (Wide Stance)', 'machine', 'glutes', null),
    (132, 'Single Leg Extension', 'machine', 'quads', null),
    (46, 'Dumbbell Bent Lateral Raise', 'dumbbell', 'shoulders', null),
    (55, 'Dumbbell Lateral Raise (Super ROM)', 'dumbbell', 'shoulders', null),
    (93, 'Machine Bent Over Lateral Raise (MaxPump)', 'machine', 'shoulders', null),
    (103, 'Machine Low Row', 'machine', 'back', null),
    (115, 'MaxPump Incline Press', 'machine', 'chest', null),
    (89, 'Leg Press (Watson Split Leg Press)', 'machine', 'quads', null),
    (144, 'Standing Shoulder Press (Machine)', 'machine', 'shoulders', null),
    (34, 'Cable Tricep Kickback', 'cable', 'triceps', null),
    (37, 'Cable Triceps Pushdown (Single-Arm)', 'cable', 'triceps', null),
    (95, 'Machine Chest Press (Incline)', 'machine', 'chest', null),
    (5, 'Back Raise (45 degree)', 'bodyweight only', 'hamstrings', null),
    (145, 'StIff Leg Deadlift', 'dumbbell', 'hamstrings', null),
    (33, 'Cable Rotator Cuff Rotation (Internal)', 'cable', 'shoulders', null),
    (78, 'EZ Bar Overhead Triceps Extension (Seated)', 'barbell', 'triceps', null),
    (26, 'Cable Hammer Curl (Rope)', 'cable', 'biceps', null),
    (114, 'MaxPump Hip Press (Single Leg)', 'machine', 'glutes', null),
    (148, 'Walking Lunges (Glute-Focused, Barbell)', 'barbell', 'glutes', null),
    (74, 'Dumbbell Y-Raise', 'dumbbell', 'shoulders', null),
    (8, 'Barbell Overhead Triceps Extension (Seated)', 'barbell', 'triceps', null),
    (45, 'Dip (Weighted, Triceps-Focused)', 'bodyweight loadable', 'triceps', null),
    (56, 'Dumbbell Overhead Extension', 'dumbbell', 'triceps', null),
    (151, 'Ab Wheel', 'bodyweight only', 'abs', null),
    (206, 'Cable Rope Crunch', 'cable', 'abs', null),
    (265, 'Hanging Knee Raise', 'bodyweight only', 'abs', null),
    (266, 'Hanging Straight Leg Raise', 'bodyweight only', 'abs', null),
    (277, 'Modified Candlestick', 'bodyweight only', 'abs', null),
    (295, 'Reaching Sit-Up', 'bodyweight only', 'abs', null),
    (327, 'V-Up (Weighted)', 'bodyweight loadable', 'abs', null),
    (152, 'Assisted Pullup (Underhand Grip)', 'machine assistance', 'back', null),
    (153, 'Assisted Pullup (Wide Grip)', 'machine assistance', 'back', null),
    (154, 'Back Extension', 'bodyweight loadable', 'back', null),
    (155, 'Back Extension (Flexion)', 'bodyweight loadable', 'back', null),
    (157, 'Barbell Bent Over Row', 'barbell', 'back', null),
    (162, 'Barbell Flexion Row', 'barbell', 'back', null),
    (171, 'Barbell Pullover', 'barbell', 'back', null),
    (172, 'Barbell Row to Chest', 'barbell', 'back', null),
    (199, 'Cable Flexion Row', 'cable', 'back', null),
    (205, 'Cable Pullover', 'cable', 'back', null),
    (213, 'Cambered Bar Row', 'barbell', 'back', null),
    (217, 'Deadlift (Flexion)', 'barbell', 'back', null),
    (225, 'Dual Cable Pullover', 'cable', 'back', null),
    (226, 'Dumbbbell Flexion Row', 'dumbbell', 'back', null),
    (240, 'Dumbbell Pullover', 'dumbbell', 'back', null),
    (248, 'EZ Bar Row (Underhand)', 'barbell', 'back', null),
    (269, 'Inverted Row', 'bodyweight only', 'back', null),
    (272, 'Landmine Row', 'barbell', 'back', null),
    (276, 'Meadows Row', 'barbell', 'back', null),
    (280, 'Pulldown (Narrow Grip)', 'cable', 'back', null),
    (281, 'Pulldown (Single-Arm)', 'cable', 'back', null),
    (282, 'Pulldown (Underhand Grip)', 'cable', 'back', null),
    (283, 'Pulldown (Upright Torso to Abs)', 'cable', 'back', null),
    (284, 'Pullup (Normal Grip)', 'bodyweight only', 'back', null),
    (285, 'Pullup (Parallel Grip)', 'bodyweight only', 'back', null),
    (286, 'Pullup (Underhand Grip)', 'bodyweight only', 'back', null),
    (287, 'Pullup (Weighted, Parallel Grip)', 'bodyweight loadable', 'back', null),
    (288, 'Pullup (Weighted, Underhand Grip)', 'bodyweight loadable', 'back', null),
    (289, 'Pullup (Weighted, Wide Grip)', 'bodyweight loadable', 'back', null),
    (290, 'Pullup (Wide Grip)', 'bodyweight only', 'back', null),
    (302, 'Seal Row', 'barbell', 'back', null),
    (303, 'Seated Cable Row (Single-Arm)', 'cable', 'back', null),
    (320, 'Smith Machine Row', 'smith machine', 'back', null),
    (325, 'T-Bar Row', 'machine', 'back', null),
    (159, 'Barbell Curl (Narrow Grip)', 'barbell', 'biceps', null),
    (160, 'Barbell Curl (Normal Grip)', 'barbell', 'biceps', null),
    (180, 'Bayesian Curl', 'cable', 'biceps', null),
    (196, 'Cable Curl (EZ Bar)', 'cable', 'biceps', null),
    (197, 'Cable Curl (EZ Bar, Wide Grip)', 'cable', 'biceps', null),
    (198, 'Cable Curl (Single-Arm)', 'cable', 'biceps', null),
    (214, 'Concentration Curl', 'dumbbell', 'biceps', null),
    (220, 'Decline Dumbbell Curl', 'dumbbell', 'biceps', null),
    (238, 'Dumbbell Preacher Curl (Single-Arm)', 'dumbbell', 'biceps', null),
    (243, 'Dumbbell Spider Curl', 'dumbbell', 'biceps', null),
    (245, 'Dumbbell Twist Curl', 'dumbbell', 'biceps', null),
    (246, 'EZ Bar Curl (Normal Grip)', 'barbell', 'biceps', null),
    (247, 'EZ Bar Curl (Wide Grip)', 'barbell', 'biceps', null),
    (250, 'EZ Bar Spider Curl', 'barbell', 'biceps', null),
    (251, 'Freemotion Curl (Facing Away)', 'freemotion', 'biceps', null),
    (252, 'Freemotion Curl (Facing Machine)', 'freemotion', 'biceps', null),
    (253, 'Freemotion Curl (Single-Arm)', 'freemotion', 'biceps', null),
    (264, 'Hammer Preacher Curl', 'dumbbell', 'biceps', null),
    (273, 'Lying Cable Curl', 'cable', 'biceps', null),
    (274, 'Lying Dumbbell Curl', 'dumbbell', 'biceps', null),
    (181, 'Belt Squat Calves', 'machine', 'calves', null),
    (224, 'Donkey Calf Raise', 'machine', 'calves', null),
    (182, 'Bench Press (Cambered Bar)', 'barbell', 'chest', null),
    (184, 'Bench Press (Decline)', 'barbell', 'chest', null),
    (185, 'Bench Press (Incline, Narrow Grip)', 'barbell', 'chest', null),
    (186, 'Bench Press (Incline, Wide Grip)', 'barbell', 'chest', null),
    (187, 'Bench Press (Narrow Grip)', 'barbell', 'chest', null),
    (188, 'Bench Press (Wide Grip)', 'barbell', 'chest', null),
    (193, 'Cable Chest Press', 'cable', 'chest', null),
    (200, 'Cable Flye (Seated)', 'cable', 'chest', null),
    (201, 'Cable Flye (Underhand)', 'cable', 'chest', null),
    (221, 'Dip (Chest-Focused)', 'bodyweight only', 'chest', null),
    (222, 'Dip (Weighted, Chest-Focused)', 'bodyweight loadable', 'chest', null),
    (239, 'Dumbbell Press Flye (Flat)', 'dumbbell', 'chest', null),
    (263, 'Hammer Machine Chest Press (Incline)', 'machine', 'chest', null),
    (279, 'Pec Dec Flye', 'machine', 'chest', null),
    (291, 'Pushup (Deficit)', 'bodyweight only', 'chest', null),
    (292, 'Pushup (Narrow Grip)', 'bodyweight only', 'chest', null),
    (293, 'Pushup (Weighted, Narrow Grip)', 'bodyweight loadable', 'chest', null),
    (294, 'Pushup (Weighted, Normal Grip)', 'bodyweight loadable', 'chest', null),
    (308, 'Smith Machine Bench Press (Narrow Grip)', 'smith machine', 'chest', null),
    (309, 'Smith Machine Bench Press (Wide Grip)', 'smith machine', 'chest', null),
    (311, 'Smith Machine Press (High Incline, Medium Grip)', 'smith machine', 'chest', null),
    (312, 'Smith Machine Press (High Incline, Narrow Grip)', 'smith machine', 'chest', null),
    (313, 'Smith Machine Press (High Incline, Wide Grip)', 'smith machine', 'chest', null),
    (314, 'Smith Machine Press (Incline, Medium Grip)', 'smith machine', 'chest', null),
    (315, 'Smith Machine Press (Incline, Wide Grip)', 'smith machine', 'chest', null),
    (316, 'Smith Machine Press (Low Incline, Medium Grip)', 'smith machine', 'chest', null),
    (317, 'Smith Machine Press (Low Incline, Narrow Grip)', 'smith machine', 'chest', null),
    (318, 'Smith Machine Press (Low Incline, Wide Grip)', 'smith machine', 'chest', null),
    (319, 'Smith Machine Press (Medium Incline, Narrow Grip)', 'smith machine', 'chest', null),
    (178, 'Barbell Standing Wrist Curl', 'barbell', 'forearms', null),
    (212, 'Cable Wrist Curl', 'cable', 'forearms', null),
    (227, 'Dumbbell Bench Wrist Curl', 'dumbbell', 'forearms', null),
    (244, 'Dumbbell Standing Wrist Curl', 'dumbbell', 'forearms', null),
    (262, 'Grip Roller', 'machine', 'forearms', null),
    (296, 'Reverse Curl', 'barbell', 'forearms', null),
    (190, 'Bulgarian Split Squat (Glute-Focused)', 'dumbbell', 'glutes', null),
    (203, 'Cable Kickback', 'cable', 'glutes', null),
    (204, 'Cable Pull Through', 'cable', 'glutes', null),
    (216, 'Deadlift (Deficit 25''s)', 'barbell', 'glutes', null),
    (218, 'Deadlift (Sumo Stance)', 'barbell', 'glutes', null),
    (219, 'Deadlift (Sumo Stance, Deficit)', 'barbell', 'glutes', null),
    (232, 'Dumbbell Hip Thrust (Single Leg)', 'dumbbell', 'glutes', null),
    (258, 'Front Foot Elevated Smith Lunge', 'smith machine', 'glutes', null),
    (267, 'Hip Abduction Machine', 'machine', 'glutes', null),
    (297, 'Reverse Hyper', 'machine', 'glutes', null),
    (298, 'Reverse Lunge (Dumbbell)', 'dumbbell', 'glutes', null),
    (300, 'Rogers Reverse Lunge', 'machine', 'glutes', null),
    (326, 'Trap Bar Deadlift', 'barbell', 'glutes', null),
    (328, 'Walking Lunges (Glute-Focused, Dumbbell)', 'dumbbell', 'glutes', null),
    (156, 'Back Raise (Glute Ham Deck)', 'bodyweight only', 'hamstrings', null),
    (166, 'Barbell Good Morning (Cambered Bar)', 'barbell', 'hamstrings', null),
    (167, 'Barbell Good Morning (High Bar)', 'barbell', 'hamstrings', null),
    (168, 'Barbell Good Morning (Low Bar)', 'barbell', 'hamstrings', null),
    (169, 'Barbell Good Morning (Safety Bar)', 'barbell', 'hamstrings', null),
    (278, 'Nordic Curl', 'bodyweight only', 'hamstrings', null),
    (299, 'Rogers Good Morning', 'machine', 'hamstrings', null),
    (305, 'Single Leg Romanian Deadlift', 'dumbbell', 'hamstrings', null),
    (176, 'Barbell Squat (Cambered Bar)', 'barbell', 'quads', null),
    (177, 'Barbell Squat (Safety Bar)', 'barbell', 'quads', null),
    (189, 'Bodyweight Squat (2/3)', 'bodyweight only', 'quads', null),
    (191, 'Bulgarian Split Squat (Quad-Focused)', 'dumbbell', 'quads', null),
    (231, 'Dumbbell Front Squat', 'dumbbell', 'quads', null),
    (259, 'Front Squat', 'barbell', 'quads', null),
    (260, 'Front Squat (Cross Grip)', 'barbell', 'quads', null),
    (261, 'Goblet Squat', 'dumbbell', 'quads', null),
    (268, 'Hip Adduction', 'machine', 'quads', null),
    (301, 'Rogers Squat', 'machine', 'quads', null),
    (304, 'Single Leg Press', 'machine', 'quads', null),
    (306, 'Sissy Squat (Machine)', 'bodyweight only', 'quads', null),
    (307, 'Sissy Squat (No Machine)', 'bodyweight only', 'quads', null),
    (329, 'Walking Lunges (Quad-Focused, Barbell)', 'barbell', 'quads', null),
    (330, 'Walking Lunges (Quad-Focused, Dumbbell)', 'dumbbell', 'quads', null),
    (161, 'Barbell Facepull', 'barbell', 'shoulders', null),
    (163, 'Barbell Front Raise', 'barbell', 'shoulders', null),
    (164, 'Barbell Front Raise (EZ Bar, Underhand)', 'barbell', 'shoulders', null),
    (165, 'Barbell Front Raise (Overhand)', 'barbell', 'shoulders', null),
    (173, 'Barbell Shoulder Press (Seated)', 'barbell', 'shoulders', null),
    (174, 'Barbell Shoulder Press (Standing)', 'barbell', 'shoulders', null),
    (179, 'Barbell Upright Row', 'barbell', 'shoulders', null),
    (194, 'Cable Cross Body Bent Lateral Raise', 'cable', 'shoulders', null),
    (195, 'Cable Cross Body Lateral Raise', 'cable', 'shoulders', null),
    (202, 'Cable Front Raise (Overhand)', 'cable', 'shoulders', null),
    (207, 'Cable Rope Facepull (Kneeling)', 'cable', 'shoulders', null),
    (210, 'Cable Single Arm Rear Delt Raise', 'cable', 'shoulders', null),
    (229, 'Dumbbell Facepull', 'dumbbell', 'shoulders', null),
    (230, 'Dumbbell Facepull (Incline)', 'dumbbell', 'shoulders', null),
    (233, 'Dumbbell Lateral Raise (Seated)', 'dumbbell', 'shoulders', null),
    (234, 'Dumbbell Lateral Raise (Thumbs Down)', 'dumbbell', 'shoulders', null),
    (235, 'Dumbbell Lateral Raise (Top Hold)', 'dumbbell', 'shoulders', null),
    (241, 'Dumbbell Shoulder Press (Standing)', 'dumbbell', 'shoulders', null),
    (254, 'Freemotion Rear Delt Flyes', 'freemotion', 'shoulders', null),
    (255, 'Freemotion Rear Delt Flyes (Paused)', 'freemotion', 'shoulders', null),
    (256, 'Freemotion Y-Raises', 'freemotion', 'shoulders', null),
    (257, 'Freemotion Y-Raises (Paused)', 'freemotion', 'shoulders', null),
    (324, 'Smith Machine Upright Row', 'smith machine', 'shoulders', null),
    (42, 'Barbell Bent Over Shrug', 'barbell', 'traps', null),
    (81, 'Cable Bent Over Shrug', 'cable', 'traps', null),
    (140, 'Cable Shrug', 'cable', 'traps', null),
    (158, 'Cable Side Shrug', 'cable', 'traps', null),
    (175, 'Cable Single Arm Side Shrug', 'cable', 'traps', null),
    (208, 'Dumbbell Bent Over Shrug', 'dumbbell', 'traps', null),
    (209, 'Dumbbell Leaning Shrug', 'dumbbell', 'traps', null),
    (275, 'Machine Shrug', 'machine', 'traps', null),
    (321, 'Smith Machine Shrug', 'smith machine', 'traps', null),
    (170, 'Barbell Overhead Triceps Extension', 'barbell', 'triceps', null),
    (183, 'Bench Press (Close Grip)', 'barbell', 'triceps', null),
    (223, 'Dip Machine', 'machine', 'triceps', null),
    (249, 'EZ Bar Skullcrusher', 'barbell', 'triceps', null),
    (270, 'Inverted Skullcrusher', 'bodyweight only', 'triceps', null),
    (271, 'JM Press', 'barbell', 'triceps', null),
    (310, 'Smith Machine JM Press', 'smith machine', 'triceps', null),
    (322, 'Smith Machine Skullcrusher', 'smith machine', 'triceps', null)
),
inserted as (
  insert into public.exercises (user_id, legacy_id, name, equipment_type)
  select null, ex.legacy_id, ex.name, ex.equipment_type from ex
  where not exists (
    select 1 from public.exercises e where e.legacy_id = ex.legacy_id
  )
  returning id, legacy_id
)
insert into public.exercise_muscle_groups (exercise_id, muscle_group_id, role)
select i.id, mg.id, r.role
from inserted i
join ex on ex.legacy_id = i.legacy_id
cross join lateral (
  values (ex.primary_mg, 'primary'), (ex.secondary_mg, 'secondary')
) as r (mg_name, role)
join public.muscle_groups mg on mg.name = r.mg_name
where r.mg_name is not null
on conflict (exercise_id, muscle_group_id) do nothing;

-- ---------------------------------------------------------------------------
-- default engine params (version 2) — mirrors src/lib/engine/params.ts
-- (version 1 is historical; migration 20260613000001 owns the v2 row on
-- existing databases, so this insert is guarded)
-- ---------------------------------------------------------------------------

insert into public.engine_params (version, params, is_active, notes)
select 2, '{
  "increment": {
    "barbell": { "kg": 2.5, "lb": 5 },
    "smith": { "kg": 2.5, "lb": 5 },
    "dumbbell": { "kg": 2.0, "lb": 5 },
    "machine": { "kg": 2.5, "lb": 5 },
    "cable": { "kg": 2.5, "lb": 5 },
    "bodyweight": { "kg": 2.5, "lb": 5 },
    "bands": { "kg": 5.0, "lb": 10 },
    "kettlebell": { "kg": 4.0, "lb": 9 },
    "other": { "kg": 2.5, "lb": 5 }
  },
  "experience_increment_scale": {
    "beginner": 1.5,
    "intermediate": 1.0,
    "advanced": 0.5
  },
  "progression_style": {
    "gain": "load_first",
    "cut": "hold",
    "maintain": "hold"
  },
  "small_miss_reps": 2,
  "regression_pct": 0.9,
  "pain_gate": 2,
  "workload_high": 8,
  "workload_low": 3,
  "set_add_pump_min": 6,
  "pump_low": 2,
  "min_sets": 2,
  "max_sets_per_exercise": 6,
  "mg_set_ceiling": 20,
  "session_fatigue_dampen_threshold": 3,
  "session_performance_dampen_threshold": 1,
  "deload": { "load_pct": 0.55, "set_pct": 0.5, "target_rir": 4 },
  "meso_seed_backoff_pct": 0.925,
  "rounding": {
    "barbell": { "kg": 2.5, "lb": 5 },
    "smith": { "kg": 2.5, "lb": 5 },
    "dumbbell": { "kg": 2.0, "lb": 5 },
    "machine": { "kg": 2.5, "lb": 5 },
    "cable": { "kg": 2.5, "lb": 5 },
    "bodyweight": { "kg": 2.5, "lb": 5 },
    "bands": { "kg": 5.0, "lb": 10 },
    "kettlebell": { "kg": 4.0, "lb": 9 },
    "other": { "kg": 2.5, "lb": 5 }
  }
}'::jsonb, false, 'v2 — pivot feedback re-alignment (pump/workload 0-10), per-equipment per-unit increments incl. bands/kettlebell'
where not exists (select 1 from public.engine_params where version = 2);

-- ---------------------------------------------------------------------------
-- default engine params (version 3, active) — adds the metric blocks
-- (e1rm, macro_target, phase_plan, key_lifts; 10-metrics-spec.md §8).
-- Migration 20260614000001 owns the v3 row on existing databases; this guarded
-- insert covers a fresh seed. Mirrors src/lib/engine/params.ts defaults.
-- ---------------------------------------------------------------------------

update public.engine_params set is_active = false where version < 3 and is_active;

insert into public.engine_params (version, params, is_active, notes)
select 3, '{
  "increment": {
    "barbell": { "kg": 2.5, "lb": 5 },
    "smith": { "kg": 2.5, "lb": 5 },
    "dumbbell": { "kg": 2.0, "lb": 5 },
    "machine": { "kg": 2.5, "lb": 5 },
    "cable": { "kg": 2.5, "lb": 5 },
    "bodyweight": { "kg": 2.5, "lb": 5 },
    "bands": { "kg": 5.0, "lb": 10 },
    "kettlebell": { "kg": 4.0, "lb": 9 },
    "other": { "kg": 2.5, "lb": 5 }
  },
  "experience_increment_scale": {
    "beginner": 1.5,
    "intermediate": 1.0,
    "advanced": 0.5
  },
  "progression_style": {
    "gain": "load_first",
    "cut": "hold",
    "maintain": "hold"
  },
  "small_miss_reps": 2,
  "regression_pct": 0.9,
  "pain_gate": 2,
  "workload_high": 8,
  "workload_low": 3,
  "set_add_pump_min": 6,
  "pump_low": 2,
  "min_sets": 2,
  "max_sets_per_exercise": 6,
  "mg_set_ceiling": 20,
  "session_fatigue_dampen_threshold": 3,
  "session_performance_dampen_threshold": 1,
  "deload": { "load_pct": 0.55, "set_pct": 0.5, "target_rir": 4 },
  "meso_seed_backoff_pct": 0.925,
  "rounding": {
    "barbell": { "kg": 2.5, "lb": 5 },
    "smith": { "kg": 2.5, "lb": 5 },
    "dumbbell": { "kg": 2.0, "lb": 5 },
    "machine": { "kg": 2.5, "lb": 5 },
    "cable": { "kg": 2.5, "lb": 5 },
    "bodyweight": { "kg": 2.5, "lb": 5 },
    "bands": { "kg": 5.0, "lb": 10 },
    "kettlebell": { "kg": 4.0, "lb": 9 },
    "other": { "kg": 2.5, "lb": 5 }
  },
  "e1rm": {
    "rir_offset": 1.0,
    "high_max_eff_reps": 8,
    "mod_max_eff_reps": 12,
    "high_max_rir": 2,
    "mod_max_rir": 3
  },
  "macro_target": {
    "sex_factor_female": 0.5,
    "career_cap_lb": { "male": 40, "female": 20 },
    "career_tau_years": 3,
    "hypertrophy_pct_bw_month": { "beginner": [1.0, 1.5], "intermediate": [0.5, 1.0], "advanced": [0.25, 0.5] },
    "strength_pct_month": { "beginner": [4, 8], "intermediate": [1.5, 3], "advanced": [0.5, 1.5] },
    "strength_cap_total_pct": { "beginner": 60, "intermediate": 30, "advanced": 15 },
    "cut_pct_bw_week": { "high_bf": [1.0, 1.5], "average": [0.5, 1.0], "lean": [0.25, 0.5] },
    "cut_bmi_high": 27,
    "cut_bmi_lean": 22,
    "age_taper": true,
    "age_taper_start": 40,
    "age_taper_per_year": 0.02,
    "age_taper_floor": 0.6,
    "recommend_target_lb": { "male": 8, "female": 4 },
    "recommend_strength_total_pct": 10,
    "recommend_cut_bw_pct": 8,
    "recommend_min_months": 2,
    "recommend_max_months": 12,
    "present": "conservative_end"
  },
  "phase_plan": { "order": ["accumulation", "intensification", "peak"], "accumulation_fraction": 0.6 },
  "key_lifts": { "n": 5, "selection": "frequency" }
}'::jsonb, false, 'v3 — metric defaults: e1RM, macro_target (planMacrocycle), phase_plan, key_lifts (10-metrics-spec.md)'
where not exists (select 1 from public.engine_params where version = 3);

-- ---------------------------------------------------------------------------
-- default engine params (version 4, active) — macrocycle-target fix
-- (10-metrics-spec.md §5): hypertrophy rate decays continuously with training
-- age (replaces the discrete buckets + hard career-cap clamp that flattened
-- the per-macro target across durations); cut compounds + is %BW-capped.
-- Migration 20260614000003 owns the v4 row on existing databases.
-- ---------------------------------------------------------------------------

update public.engine_params set is_active = false where version < 4 and is_active;

insert into public.engine_params (version, params, is_active, notes)
select 4, '{
  "increment": {
    "barbell": { "kg": 2.5, "lb": 5 },
    "smith": { "kg": 2.5, "lb": 5 },
    "dumbbell": { "kg": 2.0, "lb": 5 },
    "machine": { "kg": 2.5, "lb": 5 },
    "cable": { "kg": 2.5, "lb": 5 },
    "bodyweight": { "kg": 2.5, "lb": 5 },
    "bands": { "kg": 5.0, "lb": 10 },
    "kettlebell": { "kg": 4.0, "lb": 9 },
    "other": { "kg": 2.5, "lb": 5 }
  },
  "experience_increment_scale": {
    "beginner": 1.5,
    "intermediate": 1.0,
    "advanced": 0.5
  },
  "progression_style": {
    "gain": "load_first",
    "cut": "hold",
    "maintain": "hold"
  },
  "small_miss_reps": 2,
  "regression_pct": 0.9,
  "pain_gate": 2,
  "workload_high": 8,
  "workload_low": 3,
  "set_add_pump_min": 6,
  "pump_low": 2,
  "min_sets": 2,
  "max_sets_per_exercise": 6,
  "mg_set_ceiling": 20,
  "session_fatigue_dampen_threshold": 3,
  "session_performance_dampen_threshold": 1,
  "deload": { "load_pct": 0.55, "set_pct": 0.5, "target_rir": 4 },
  "meso_seed_backoff_pct": 0.925,
  "rounding": {
    "barbell": { "kg": 2.5, "lb": 5 },
    "smith": { "kg": 2.5, "lb": 5 },
    "dumbbell": { "kg": 2.0, "lb": 5 },
    "machine": { "kg": 2.5, "lb": 5 },
    "cable": { "kg": 2.5, "lb": 5 },
    "bodyweight": { "kg": 2.5, "lb": 5 },
    "bands": { "kg": 5.0, "lb": 10 },
    "kettlebell": { "kg": 4.0, "lb": 9 },
    "other": { "kg": 2.5, "lb": 5 }
  },
  "e1rm": {
    "rir_offset": 1.0,
    "high_max_eff_reps": 8,
    "mod_max_eff_reps": 12,
    "high_max_rir": 2,
    "mod_max_rir": 3
  },
  "macro_target": {
    "sex_factor_female": 0.5,
    "hypertrophy_base_pct_bw_month": { "low": 1.0, "high": 1.5 },
    "hypertrophy_decay_tau_years": 5,
    "career_cap_lb": { "male": 40, "female": 20 },
    "career_tau_years": 3,
    "hypertrophy_pct_bw_month": { "beginner": [1.0, 1.5], "intermediate": [0.5, 1.0], "advanced": [0.25, 0.5] },
    "strength_pct_month": { "beginner": [4, 8], "intermediate": [1.5, 3], "advanced": [0.5, 1.5] },
    "strength_cap_total_pct": { "beginner": 60, "intermediate": 30, "advanced": 15 },
    "cut_pct_bw_week": { "high_bf": [1.0, 1.5], "average": [0.5, 1.0], "lean": [0.25, 0.5] },
    "cut_bmi_high": 27,
    "cut_bmi_lean": 22,
    "cut_cap_pct_bw": 0.25,
    "age_taper": true,
    "age_taper_start": 40,
    "age_taper_per_year": 0.02,
    "age_taper_floor": 0.6,
    "recommend_target_lb": { "male": 8, "female": 4 },
    "recommend_strength_total_pct": 10,
    "recommend_cut_bw_pct": 8,
    "recommend_min_months": 2,
    "recommend_max_months": 12,
    "present": "conservative_end"
  },
  "phase_plan": { "order": ["accumulation", "intensification", "peak"], "accumulation_fraction": 0.6 },
  "key_lifts": { "n": 5, "selection": "frequency" }
}'::jsonb, false, 'v4 — macro-target fix: continuous training-age hypertrophy decay + compounding/capped cut (10-metrics-spec.md §5)'
where not exists (select 1 from public.engine_params where version = 4);

-- ---------------------------------------------------------------------------
-- default engine params (version 5, active) — FFMI proximity-to-potential
-- hypertrophy model + body-fat cut bands; sex factor 0.5->0.7 (10-spec §5).
-- Migration 20260615000001 owns the v5 row on existing databases.
-- ---------------------------------------------------------------------------

update public.engine_params set is_active = false where version < 5 and is_active;

insert into public.engine_params (version, params, is_active, notes)
select 5, '{
  "increment": { "barbell": { "kg": 2.5, "lb": 5 }, "smith": { "kg": 2.5, "lb": 5 }, "dumbbell": { "kg": 2.0, "lb": 5 }, "machine": { "kg": 2.5, "lb": 5 }, "cable": { "kg": 2.5, "lb": 5 }, "bodyweight": { "kg": 2.5, "lb": 5 }, "bands": { "kg": 5.0, "lb": 10 }, "kettlebell": { "kg": 4.0, "lb": 9 }, "other": { "kg": 2.5, "lb": 5 } },
  "experience_increment_scale": { "beginner": 1.5, "intermediate": 1.0, "advanced": 0.5 },
  "progression_style": { "gain": "load_first", "cut": "hold", "maintain": "hold" },
  "small_miss_reps": 2, "regression_pct": 0.9, "pain_gate": 2, "workload_high": 8, "workload_low": 3, "set_add_pump_min": 6, "pump_low": 2, "min_sets": 2, "max_sets_per_exercise": 6, "mg_set_ceiling": 20, "session_fatigue_dampen_threshold": 3, "session_performance_dampen_threshold": 1,
  "deload": { "load_pct": 0.55, "set_pct": 0.5, "target_rir": 4 }, "meso_seed_backoff_pct": 0.925,
  "rounding": { "barbell": { "kg": 2.5, "lb": 5 }, "smith": { "kg": 2.5, "lb": 5 }, "dumbbell": { "kg": 2.0, "lb": 5 }, "machine": { "kg": 2.5, "lb": 5 }, "cable": { "kg": 2.5, "lb": 5 }, "bodyweight": { "kg": 2.5, "lb": 5 }, "bands": { "kg": 5.0, "lb": 10 }, "kettlebell": { "kg": 4.0, "lb": 9 }, "other": { "kg": 2.5, "lb": 5 } },
  "e1rm": { "rir_offset": 1.0, "high_max_eff_reps": 8, "mod_max_eff_reps": 12, "high_max_rir": 2, "mod_max_rir": 3 },
  "macro_target": {
    "sex_factor_female": 0.7,
    "hypertrophy_base_pct_bw_month": { "low": 1.0, "high": 1.5 },
    "hypertrophy_decay_tau_years": 5,
    "hypertrophy_floor_pct_bw_month": { "low": 0.04, "high": 0.09 },
    "ffmi_ceiling": { "male": 25, "female": 21.5 },
    "ffmi_untrained": { "male": 18.5, "female": 14.5 },
    "proximity_macro_cap_frac": 0.6,
    "cut_bf_thresholds": { "male": { "high": 20, "lean": 12 }, "female": { "high": 30, "lean": 22 } },
    "career_cap_lb": { "male": 40, "female": 20 },
    "career_tau_years": 3,
    "hypertrophy_pct_bw_month": { "beginner": [1.0, 1.5], "intermediate": [0.5, 1.0], "advanced": [0.25, 0.5] },
    "strength_pct_month": { "beginner": [4, 8], "intermediate": [1.5, 3], "advanced": [0.5, 1.5] },
    "strength_cap_total_pct": { "beginner": 60, "intermediate": 30, "advanced": 15 },
    "cut_pct_bw_week": { "high_bf": [1.0, 1.5], "average": [0.5, 1.0], "lean": [0.25, 0.5] },
    "cut_bmi_high": 27, "cut_bmi_lean": 22, "cut_cap_pct_bw": 0.25,
    "age_taper": true, "age_taper_start": 40, "age_taper_per_year": 0.02, "age_taper_floor": 0.6,
    "recommend_target_lb": { "male": 8, "female": 4 }, "recommend_strength_total_pct": 10, "recommend_cut_bw_pct": 8, "recommend_min_months": 2, "recommend_max_months": 12, "present": "conservative_end"
  },
  "phase_plan": { "order": ["accumulation", "intensification", "peak"], "accumulation_fraction": 0.6 },
  "key_lifts": { "n": 5, "selection": "frequency" }
}'::jsonb, true, 'v5 — FFMI proximity-to-potential hypertrophy + body-fat cut bands; sex factor 0.7 (10-metrics-spec.md §5)'
where not exists (select 1 from public.engine_params where version = 5);

-- BEGIN APPROVED SECONDARY ASSIGNMENTS (same SQL as migration)
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
-- END APPROVED SECONDARY ASSIGNMENTS
