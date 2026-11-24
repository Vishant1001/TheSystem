-- GENERATED FILE - DO NOT EDIT BY HAND.
-- Source: src/game/game-config.json (+ src/game/testdata/game-date-vectors.json)
-- Regenerate: npm run gen:sql

-- Penalty Zone parity (Phase 2, Step 2.3). Generated from
--   src/game/testdata/level-curve-vectors.json -> xp_to_next (every level)
--   src/game/testdata/debt-vectors.json        -> debt_amount, debt_repayment
--   src/game/testdata/penalty-vectors.json     -> trial_category, weakened_stat_for,
--                                                 failed_day_action, penalty_transition_allowed
--   src/game/testdata/award-vectors.json       -> compute_award
-- The same files drive the engine tests in src/game.

do $$
declare
  v_expected integer[] := array[60, 70, 90, 110, 140, 180, 210, 260, 300, 350, 400, 460, 520, 580, 650, 720, 790, 870, 950, 1030, 1110, 1200, 1290, 1380, 1480, 1580, 1680, 1780, 1890, 2000, 2110, 2220, 2340, 2460, 2580, 2700, 2830, 2960, 3090, 3220, 3360, 3500, 3640, 3780, 3930, 4080, 4230, 4380, 4530, 4690, 4850, 5010, 5170, 5340, 5500, 5670, 5850, 6020, 6200, 6370, 6550, 6740, 6920, 7110, 7300, 7490, 7680, 7870, 8070, 8270, 8470, 8670, 8880, 9080, 9290, 9500, 9710, 9930, 10150, 10360, 10580, 10810, 11030, 11260, 11480, 11710, 11940, 12180, 12410, 12650, 12890, 13130, 13370, 13620, 13860, 14110, 14360, 14610, 14870, 15120, 15380, 15640, 15900, 16160, 16420, 16690, 16960, 17230, 17500, 17770, 18050, 18320, 18600, 18880, 19160, 19450, 19730, 20020, 20310, 20600, 20890, 21180, 21480, 21780, 22070, 22370, 22680, 22980, 23290, 23590, 23900, 24210, 24520, 24840, 25150, 25470, 25790, 26110, 26430, 26750, 27080, 27410, 27730, 28060, 28400, 28730, 29060, 29400, 29740, 30080, 30420, 30760, 31100, 31450, 31800, 32150, 32500, 32850, 33200, 33560, 33920, 34270, 34630, 35000, 35360, 35720, 36090, 36460, 36830, 37200, 37570, 37940, 38320, 38690, 39070, 39450, 39830, 40220, 40600, 40990, 41370, 41760, 42150, 42550, 42940, 43330, 43730, 44130, 44530, 44930, 45330, 45730, 46140, 46550, 46950, 47360, 47770, 48190, 48600, 49020, 49430, 49850, 50270, 50690, 51120, 51540, 51970, 52390, 52820, 53250, 53680, 54120, 54550, 54990, 55420, 55860, 56300, 56740, 57190, 57630, 58080, 58520, 58970, 59420, 59870, 60320, 60780, 61230, 61690, 62150, 62610, 63070, 63530, 64000, 64460, 64930, 65400, 65870, 66340, 66810, 67280, 67760, 68230, 68710, 69190, 69670, 70150, 70640, 71120, 71610, 72090, 72580, 73070, 73560, 74060, 74550, 75050, 75540, 76040, 76540, 77040, 77540, 78050, 78550, 79060, 79570, 80070, 80580, 81100, 81610, 82120, 82640, 83160, 83670, 84190, 84710, 85240, 85760, 86280, 86810, 87340, 87870, 88400, 88930, 89460, 89990, 90530, 91070, 91600, 92140, 92680, 93230, 93770, 94310, 94860, 95410, 95950, 96500, 97050, 97610, 98160, 98710, 99270, 99830, 100390, 100950, 101510, 102070, 102630, 103200, 103770, 104330, 104900, 105470, 106040, 106620, 107190, 107770, 108340, 108920, 109500, 110080, 110660, 111240, 111830, 112410, 113000, 113590, 114180, 114770, 115360, 115950, 116540, 117140, 117740, 118330, 118930, 119530, 120140, 120740, 121340, 121950, 122550, 123160, 123770, 124380, 124990, 125610, 126220, 126830, 127450, 128070, 128690, 129310, 129930, 130550, 131180, 131800, 132430, 133050, 133680, 134310, 134940, 135580, 136210, 136840, 137480, 138120, 138760, 139400, 140040, 140680, 141320, 141970, 142610, 143260, 143910, 144560, 145210, 145860, 146510, 147170, 147820, 148480, 149140, 149790, 150450, 151120, 151780, 152440, 153110, 153770, 154440, 155110, 155780, 156450, 157120, 157790, 158470, 159140, 159820, 160500, 161180, 161860, 162540, 163220, 163910, 164590, 165280, 165960, 166650, 167340, 168030, 168730, 169420, 170110, 170810, 171510, 172200, 172900, 173600, 174300, 175010, 175710, 176420, 177120, 177830, 178540, 179250, 179960, 180670, 181380, 182100, 182810, 183530, 184250, 184960, 185680, 186400, 187130, 187850, 188580, 189300, 190030, 190760, 191480, 192210, 192950, 193680, 194410, 195150, 195880, 196620, 197360, 198100, 198840, 199580, 200320, 201070, 201810, 202560, 203310, 204050, 204800, 205550, 206310, 207060, 207810, 208570, 209330, 210080, 210840, 211600, 212360, 213120, 213890, 214650, 215420, 216180, 216950, 217720, 218490, 219260, 220030, 220810, 221580, 222360, 223130, 223910, 224690, 225470, 226250, 227030, 227820, 228600, 229380, 230170, 230960, 231750, 232540, 233330, 234120, 234910, 235710, 236500, 237300, 238100, 238900, 239700, 240500, 241300, 242100, 242910, 243710, 244520, 245330, 246140, 246940, 247760, 248570, 249380, 250190, 251010, 251830, 252640, 253460, 254280, 255100, 255920, 256750, 257570, 258400, 259220, 260050, 260880, 261710, 262540, 263370, 264200, 265030, 265870, 266710, 267540, 268380, 269220, 270060, 270900, 271740, 272590, 273430, 274280, 275120, 275970, 276820, 277670, 278520, 279370, 280230, 281080, 281930, 282790, 283650, 284510, 285370, 286230, 287090, 287950, 288810, 289680, 290540, 291410, 292280, 293150, 294020, 294890, 295760, 296640, 297510, 298390, 299260, 300140, 301020, 301900, 302780, 303660, 304540, 305430, 306310, 307200, 308080, 308970, 309860, 310750, 311640, 312540, 313430, 314320, 315220, 316120, 317010, 317910, 318810, 319710, 320610, 321520, 322420, 323320, 324230, 325140, 326050, 326950, 327860, 328780, 329690, 330600, 331520, 332430, 333350, 334260, 335180, 336100, 337020, 337940, 338870, 339790, 340720, 341640, 342570, 343500, 344420, 345350, 346280, 347220, 348150, 349080, 350020, 350950, 351890, 352830, 353770, 354710, 355650, 356590, 357530, 358480, 359420, 360370, 361320, 362270, 363210, 364170, 365120, 366070, 367020, 367980, 368930, 369890, 370850, 371800, 372760, 373720, 374690, 375650, 376610, 377580, 378540, 379510, 380480, 381450, 382420, 383390, 384360, 385330, 386300, 387280, 388250, 389230, 390210, 391190, 392170, 393150, 394130, 395110, 396100, 397080, 398070, 399050, 400040, 401030, 402020, 403010, 404000, 405000, 405990, 406990, 407980, 408980, 409980, 410970, 411970, 412980, 413980, 414980, 415980, 416990, 418000, 419000, 420010, 421020, 422030, 423040, 424050, 425060, 426080, 427090, 428110, 429130, 430140, 431160, 432180, 433200, 434220, 435250, 436270, 437300, 438320, 439350, 440380, 441400, 442430, 443470, 444500, 445530, 446560, 447600, 448630, 449670, 450710, 451750, 452790, 453830, 454870, 455910, 456950, 458000, 459040, 460090, 461140, 462190, 463240, 464290, 465340, 466390, 467440, 468500, 469550, 470610, 471670, 472720, 473780, 474840, 475910, 476970, 478030, 479090, 480160, 481230, 482290, 483360, 484430, 485500, 486570, 487640, 488710, 489790, 490860, 491940, 493020, 494090, 495170, 496250, 497330, 498410, 499500, 500580, 501660, 502750, 503840, 504920, 506010, 507100, 508190, 509280, 510370, 511470, 512560, 513660, 514750, 515850, 516950, 518050, 519150, 520250, 521350, 522450, 523550, 524660, 525770, 526870, 527980, 529090, 530200, 531310, 532420, 533530, 534640, 535760, 536870, 537990, 539110, 540230, 541340, 542460, 543580, 544710, 545830, 546950, 548080, 549200, 550330, 551460, 552590, 553720, 554850, 555980, 557110, 558240, 559380, 560510, 561650, 562790, 563920, 565060, 566200, 567340, 568490, 569630, 570770, 571920, 573060, 574210, 575360, 576500, 577650, 578800, 579950, 581110, 582260, 583410, 584570, 585720, 586880, 588040, 589200, 590360, 591520, 592680, 593840, 595010, 596170, 597340, 598500, 599670, 600840, 602010, 603180, 604350, 605520, 606690, 607870, 609040, 610220, 611390, 612570, 613750, 614930, 616110, 617290, 618470, 619650, 620840, 622020, 623210, 624400, 625580, 626770, 627960, 629150, 630340, 631540, 632730, 633920, 635120, 636310, 637510, 638710, 639910, 641110, 642310, 643510, 644710, 645920, 647120, 648330, 649530, 650740, 651950, 653160, 654370, 655580, 656790, 658000, 659220, 660430, 661640, 662860, 664080, 665300, 666520, 667740, 668960, 670180, 671400, 672630, 673850, 675080, 676300, 677530, 678760, 679990, 681220, 682450, 683680, 684910, 686150, 687380, 688620, 689850, 691090, 692330, 693570, 694810, 696050, 697290, 698530, 699780, 701020, 702270, 703520, 704760, 706010, 707260, 708510, 709760, 711010, 712270, 713520, 714780, 716030, 717290, 718550, 719800, 721060, 722320, 723580, 724850, 726110, 727370, 728640, 729900, 731170, 732440, 733710, 734970, 736240, 737520, 738790, 740060, 741330, 742610, 743880, 745160, 746440, 747720, 749000, 750280, 751560, 752840];
  v_level integer;
  v_actual integer;
begin
  for v_level in 1 .. 1 + cardinality(v_expected) - 1 loop
    v_actual := public.xp_to_next(v_level);
    if v_actual <> v_expected[v_level - 1 + 1] then
      raise exception 'xp_to_next(%) = %, expected %', v_level, v_actual,
        v_expected[v_level - 1 + 1];
    end if;
  end loop;
  raise notice 'level curve parity: % levels passed', cardinality(v_expected);
end;
$$;

do $$
declare
  v_count integer := 0;
  v_text text;
  v_action record;
begin
  -- Lenient at level 1
  v_count := v_count + 1;
  if public.debt_amount(10, 1) <> 6 then
    raise exception 'debt_amount mismatch (%): got %', 'Lenient at level 1',
      public.debt_amount(10, 1);
  end if;

  -- Standard at level 1
  v_count := v_count + 1;
  if public.debt_amount(20, 1) <> 12 then
    raise exception 'debt_amount mismatch (%): got %', 'Standard at level 1',
      public.debt_amount(20, 1);
  end if;

  -- escalated at level 1
  v_count := v_count + 1;
  if public.debt_amount(30, 1) <> 18 then
    raise exception 'debt_amount mismatch (%): got %', 'escalated at level 1',
      public.debt_amount(30, 1);
  end if;

  -- Lenient at level 10
  v_count := v_count + 1;
  if public.debt_amount(10, 10) <> 35 then
    raise exception 'debt_amount mismatch (%): got %', 'Lenient at level 10',
      public.debt_amount(10, 10);
  end if;

  -- Standard at level 10
  v_count := v_count + 1;
  if public.debt_amount(20, 10) <> 70 then
    raise exception 'debt_amount mismatch (%): got %', 'Standard at level 10',
      public.debt_amount(20, 10);
  end if;

  -- escalated at level 10
  v_count := v_count + 1;
  if public.debt_amount(30, 10) <> 105 then
    raise exception 'debt_amount mismatch (%): got %', 'escalated at level 10',
      public.debt_amount(30, 10);
  end if;

  -- Lenient at level 20
  v_count := v_count + 1;
  if public.debt_amount(10, 20) <> 103 then
    raise exception 'debt_amount mismatch (%): got %', 'Lenient at level 20',
      public.debt_amount(10, 20);
  end if;

  -- Standard at level 20
  v_count := v_count + 1;
  if public.debt_amount(20, 20) <> 206 then
    raise exception 'debt_amount mismatch (%): got %', 'Standard at level 20',
      public.debt_amount(20, 20);
  end if;

  -- escalated at level 20
  v_count := v_count + 1;
  if public.debt_amount(30, 20) <> 309 then
    raise exception 'debt_amount mismatch (%): got %', 'escalated at level 20',
      public.debt_amount(30, 20);
  end if;

  -- Standard at level 30
  v_count := v_count + 1;
  if public.debt_amount(20, 30) <> 400 then
    raise exception 'debt_amount mismatch (%): got %', 'Standard at level 30',
      public.debt_amount(20, 30);
  end if;

  -- escalated at level 30
  v_count := v_count + 1;
  if public.debt_amount(30, 30) <> 600 then
    raise exception 'debt_amount mismatch (%): got %', 'escalated at level 30',
      public.debt_amount(30, 30);
  end if;

  -- half of an odd award, floored
  v_count := v_count + 1;
  if public.debt_repayment(35, 1000) <> 17 then
    raise exception 'debt_repayment mismatch (%)', 'half of an odd award, floored';
  end if;

  -- a 1 XP award repays nothing
  v_count := v_count + 1;
  if public.debt_repayment(1, 50) <> 0 then
    raise exception 'debt_repayment mismatch (%)', 'a 1 XP award repays nothing';
  end if;

  -- a zero award repays nothing
  v_count := v_count + 1;
  if public.debt_repayment(0, 50) <> 0 then
    raise exception 'debt_repayment mismatch (%)', 'a zero award repays nothing';
  end if;

  -- never more than what is left
  v_count := v_count + 1;
  if public.debt_repayment(50, 10) <> 10 then
    raise exception 'debt_repayment mismatch (%)', 'never more than what is left';
  end if;

  -- no debt, no repayment
  v_count := v_count + 1;
  if public.debt_repayment(75, 0) <> 0 then
    raise exception 'debt_repayment mismatch (%)', 'no debt, no repayment';
  end if;

  -- a reversal is never a repayment
  v_count := v_count + 1;
  if public.debt_repayment(-20, 50) <> 0 then
    raise exception 'debt_repayment mismatch (%)', 'a reversal is never a repayment';
  end if;

  -- a clear majority
  v_count := v_count + 1;
  v_text := public.trial_category(array['life', 'diet', 'life']::text[]);
  if v_text is distinct from 'life' then
    raise exception 'trial_category mismatch (%): got %', 'a clear majority', v_text;
  end if;

  -- diet beats life on a tie
  v_count := v_count + 1;
  v_text := public.trial_category(array['life', 'diet']::text[]);
  if v_text is distinct from 'diet' then
    raise exception 'trial_category mismatch (%): got %', 'diet beats life on a tie', v_text;
  end if;

  -- fitness beats both on a three-way tie
  v_count := v_count + 1;
  v_text := public.trial_category(array['life', 'fitness', 'diet']::text[]);
  if v_text is distinct from 'fitness' then
    raise exception 'trial_category mismatch (%): got %', 'fitness beats both on a three-way tie', v_text;
  end if;

  -- a single missed quest
  v_count := v_count + 1;
  v_text := public.trial_category(array['diet']::text[]);
  if v_text is distinct from 'diet' then
    raise exception 'trial_category mismatch (%): got %', 'a single missed quest', v_text;
  end if;

  -- every tag counts, including second tags
  v_count := v_count + 1;
  v_text := public.weakened_stat_for(array['STR', 'VIT', 'VIT']::text[]);
  if v_text is distinct from 'VIT' then
    raise exception 'weakened_stat_for mismatch (%): got %', 'every tag counts, including second tags', v_text;
  end if;

  -- VIT beats INT and SENSE on a tie
  v_count := v_count + 1;
  v_text := public.weakened_stat_for(array['SENSE', 'INT', 'VIT']::text[]);
  if v_text is distinct from 'VIT' then
    raise exception 'weakened_stat_for mismatch (%): got %', 'VIT beats INT and SENSE on a tie', v_text;
  end if;

  -- STR beats AGI on a tie
  v_count := v_count + 1;
  v_text := public.weakened_stat_for(array['AGI', 'STR']::text[]);
  if v_text is distinct from 'STR' then
    raise exception 'weakened_stat_for mismatch (%): got %', 'STR beats AGI on a tie', v_text;
  end if;

  -- a clear majority on a later stat
  v_count := v_count + 1;
  v_text := public.weakened_stat_for(array['SENSE', 'SENSE', 'STR', 'INT']::text[]);
  if v_text is distinct from 'SENSE' then
    raise exception 'weakened_stat_for mismatch (%): got %', 'a clear majority on a later stat', v_text;
  end if;

  -- Standard, nothing open: a pending choice
  v_count := v_count + 1;
  select * into v_action from public.failed_day_action(
    null, null, 'standard');
  if v_action.action is distinct from 'create'
     or v_action.state is distinct from 'pending_choice'
     or v_action.debt_rate_percent is distinct from null then
    raise exception 'failed_day_action mismatch (%): got %', 'Standard, nothing open: a pending choice', v_action;
  end if;

  -- Lenient, nothing open: a 10% debt
  v_count := v_count + 1;
  select * into v_action from public.failed_day_action(
    null, null, 'lenient');
  if v_action.action is distinct from 'create'
     or v_action.state is distinct from 'debt_active'
     or v_action.debt_rate_percent is distinct from 10 then
    raise exception 'failed_day_action mismatch (%): got %', 'Lenient, nothing open: a 10% debt', v_action;
  end if;

  -- Hardcore, nothing open: a Survival Trial
  v_count := v_count + 1;
  select * into v_action from public.failed_day_action(
    null, null, 'hardcore');
  if v_action.action is distinct from 'create'
     or v_action.state is distinct from 'trial_active'
     or v_action.debt_rate_percent is distinct from null then
    raise exception 'failed_day_action mismatch (%): got %', 'Hardcore, nothing open: a Survival Trial', v_action;
  end if;

  -- a closed penalty does not block a new one
  v_count := v_count + 1;
  select * into v_action from public.failed_day_action(
    'cleared', true, 'standard');
  if v_action.action is distinct from 'create'
     or v_action.state is distinct from 'pending_choice'
     or v_action.debt_rate_percent is distinct from null then
    raise exception 'failed_day_action mismatch (%): got %', 'a closed penalty does not block a new one', v_action;
  end if;

  -- a pending choice escalates to a 30% debt
  v_count := v_count + 1;
  select * into v_action from public.failed_day_action(
    'pending_choice', false, 'standard');
  if v_action.action is distinct from 'escalate'
     or v_action.state is distinct from 'debt_active'
     or v_action.debt_rate_percent is distinct from 30 then
    raise exception 'failed_day_action mismatch (%): got %', 'a pending choice escalates to a 30% debt', v_action;
  end if;

  -- an active trial escalates to a 30% debt
  v_count := v_count + 1;
  select * into v_action from public.failed_day_action(
    'trial_active', false, 'hardcore');
  if v_action.action is distinct from 'escalate'
     or v_action.state is distinct from 'debt_active'
     or v_action.debt_rate_percent is distinct from 30 then
    raise exception 'failed_day_action mismatch (%): got %', 'an active trial escalates to a 30% debt', v_action;
  end if;

  -- an escalated debt records nothing more
  v_count := v_count + 1;
  select * into v_action from public.failed_day_action(
    'debt_active', true, 'standard');
  if v_action.action is distinct from 'none'
     or v_action.state is distinct from null
     or v_action.debt_rate_percent is distinct from null then
    raise exception 'failed_day_action mismatch (%): got %', 'an escalated debt records nothing more', v_action;
  end if;

  -- a chosen debt records nothing more
  v_count := v_count + 1;
  select * into v_action from public.failed_day_action(
    'debt_active', false, 'lenient');
  if v_action.action is distinct from 'none'
     or v_action.state is distinct from null
     or v_action.debt_rate_percent is distinct from null then
    raise exception 'failed_day_action mismatch (%): got %', 'a chosen debt records nothing more', v_action;
  end if;

  -- an active Weakened records nothing more
  v_count := v_count + 1;
  select * into v_action from public.failed_day_action(
    'weakened_active', false, 'standard');
  if v_action.action is distinct from 'none'
     or v_action.state is distinct from null
     or v_action.debt_rate_percent is distinct from null then
    raise exception 'failed_day_action mismatch (%): got %', 'an active Weakened records nothing more', v_action;
  end if;

  v_count := v_count + 1;
  if public.penalty_transition_allowed('pending_choice', 'pending_choice', 'debt') is distinct from false then
    raise exception 'transition % -> % should be refused', 'pending_choice', 'pending_choice';
  end if;
  v_count := v_count + 1;
  if public.penalty_transition_allowed('pending_choice', 'trial_active', 'debt') is distinct from true then
    raise exception 'transition % -> % should be allowed', 'pending_choice', 'trial_active';
  end if;
  v_count := v_count + 1;
  if public.penalty_transition_allowed('pending_choice', 'debt_active', 'debt') is distinct from true then
    raise exception 'transition % -> % should be allowed', 'pending_choice', 'debt_active';
  end if;
  v_count := v_count + 1;
  if public.penalty_transition_allowed('pending_choice', 'weakened_active', 'debt') is distinct from true then
    raise exception 'transition % -> % should be allowed', 'pending_choice', 'weakened_active';
  end if;
  v_count := v_count + 1;
  if public.penalty_transition_allowed('pending_choice', 'cleared', 'debt') is distinct from false then
    raise exception 'transition % -> % should be refused', 'pending_choice', 'cleared';
  end if;
  v_count := v_count + 1;
  if public.penalty_transition_allowed('pending_choice', 'redeemed', 'debt') is distinct from true then
    raise exception 'transition % -> % should be allowed', 'pending_choice', 'redeemed';
  end if;
  v_count := v_count + 1;
  if public.penalty_transition_allowed('trial_active', 'pending_choice', 'debt') is distinct from false then
    raise exception 'transition % -> % should be refused', 'trial_active', 'pending_choice';
  end if;
  v_count := v_count + 1;
  if public.penalty_transition_allowed('trial_active', 'trial_active', 'debt') is distinct from false then
    raise exception 'transition % -> % should be refused', 'trial_active', 'trial_active';
  end if;
  v_count := v_count + 1;
  if public.penalty_transition_allowed('trial_active', 'debt_active', 'debt') is distinct from true then
    raise exception 'transition % -> % should be allowed', 'trial_active', 'debt_active';
  end if;
  v_count := v_count + 1;
  if public.penalty_transition_allowed('trial_active', 'weakened_active', 'debt') is distinct from false then
    raise exception 'transition % -> % should be refused', 'trial_active', 'weakened_active';
  end if;
  v_count := v_count + 1;
  if public.penalty_transition_allowed('trial_active', 'cleared', 'debt') is distinct from true then
    raise exception 'transition % -> % should be allowed', 'trial_active', 'cleared';
  end if;
  v_count := v_count + 1;
  if public.penalty_transition_allowed('trial_active', 'redeemed', 'debt') is distinct from true then
    raise exception 'transition % -> % should be allowed', 'trial_active', 'redeemed';
  end if;
  v_count := v_count + 1;
  if public.penalty_transition_allowed('debt_active', 'pending_choice', 'debt') is distinct from false then
    raise exception 'transition % -> % should be refused', 'debt_active', 'pending_choice';
  end if;
  v_count := v_count + 1;
  if public.penalty_transition_allowed('debt_active', 'trial_active', 'debt') is distinct from false then
    raise exception 'transition % -> % should be refused', 'debt_active', 'trial_active';
  end if;
  v_count := v_count + 1;
  if public.penalty_transition_allowed('debt_active', 'debt_active', 'debt') is distinct from false then
    raise exception 'transition % -> % should be refused', 'debt_active', 'debt_active';
  end if;
  v_count := v_count + 1;
  if public.penalty_transition_allowed('debt_active', 'weakened_active', 'debt') is distinct from false then
    raise exception 'transition % -> % should be refused', 'debt_active', 'weakened_active';
  end if;
  v_count := v_count + 1;
  if public.penalty_transition_allowed('debt_active', 'cleared', 'debt') is distinct from true then
    raise exception 'transition % -> % should be allowed', 'debt_active', 'cleared';
  end if;
  v_count := v_count + 1;
  if public.penalty_transition_allowed('debt_active', 'redeemed', 'debt') is distinct from true then
    raise exception 'transition % -> % should be allowed', 'debt_active', 'redeemed';
  end if;
  v_count := v_count + 1;
  if public.penalty_transition_allowed('weakened_active', 'pending_choice', 'debt') is distinct from false then
    raise exception 'transition % -> % should be refused', 'weakened_active', 'pending_choice';
  end if;
  v_count := v_count + 1;
  if public.penalty_transition_allowed('weakened_active', 'trial_active', 'debt') is distinct from false then
    raise exception 'transition % -> % should be refused', 'weakened_active', 'trial_active';
  end if;
  v_count := v_count + 1;
  if public.penalty_transition_allowed('weakened_active', 'debt_active', 'debt') is distinct from false then
    raise exception 'transition % -> % should be refused', 'weakened_active', 'debt_active';
  end if;
  v_count := v_count + 1;
  if public.penalty_transition_allowed('weakened_active', 'weakened_active', 'debt') is distinct from false then
    raise exception 'transition % -> % should be refused', 'weakened_active', 'weakened_active';
  end if;
  v_count := v_count + 1;
  if public.penalty_transition_allowed('weakened_active', 'cleared', 'debt') is distinct from true then
    raise exception 'transition % -> % should be allowed', 'weakened_active', 'cleared';
  end if;
  v_count := v_count + 1;
  if public.penalty_transition_allowed('weakened_active', 'redeemed', 'debt') is distinct from true then
    raise exception 'transition % -> % should be allowed', 'weakened_active', 'redeemed';
  end if;
  v_count := v_count + 1;
  if public.penalty_transition_allowed('cleared', 'pending_choice', 'debt') is distinct from false then
    raise exception 'transition % -> % should be refused', 'cleared', 'pending_choice';
  end if;
  v_count := v_count + 1;
  if public.penalty_transition_allowed('cleared', 'trial_active', 'debt') is distinct from false then
    raise exception 'transition % -> % should be refused', 'cleared', 'trial_active';
  end if;
  v_count := v_count + 1;
  if public.penalty_transition_allowed('cleared', 'debt_active', 'debt') is distinct from true then
    raise exception 'transition % -> % should be allowed', 'cleared', 'debt_active';
  end if;
  if public.penalty_transition_allowed('cleared', 'debt_active', 'trial') then
    raise exception 'a cleared trial must never reopen';
  end if;
  v_count := v_count + 1;
  if public.penalty_transition_allowed('cleared', 'weakened_active', 'debt') is distinct from false then
    raise exception 'transition % -> % should be refused', 'cleared', 'weakened_active';
  end if;
  v_count := v_count + 1;
  if public.penalty_transition_allowed('cleared', 'cleared', 'debt') is distinct from false then
    raise exception 'transition % -> % should be refused', 'cleared', 'cleared';
  end if;
  v_count := v_count + 1;
  if public.penalty_transition_allowed('cleared', 'redeemed', 'debt') is distinct from false then
    raise exception 'transition % -> % should be refused', 'cleared', 'redeemed';
  end if;
  v_count := v_count + 1;
  if public.penalty_transition_allowed('redeemed', 'pending_choice', 'debt') is distinct from false then
    raise exception 'transition % -> % should be refused', 'redeemed', 'pending_choice';
  end if;
  v_count := v_count + 1;
  if public.penalty_transition_allowed('redeemed', 'trial_active', 'debt') is distinct from false then
    raise exception 'transition % -> % should be refused', 'redeemed', 'trial_active';
  end if;
  v_count := v_count + 1;
  if public.penalty_transition_allowed('redeemed', 'debt_active', 'debt') is distinct from false then
    raise exception 'transition % -> % should be refused', 'redeemed', 'debt_active';
  end if;
  v_count := v_count + 1;
  if public.penalty_transition_allowed('redeemed', 'weakened_active', 'debt') is distinct from false then
    raise exception 'transition % -> % should be refused', 'redeemed', 'weakened_active';
  end if;
  v_count := v_count + 1;
  if public.penalty_transition_allowed('redeemed', 'cleared', 'debt') is distinct from false then
    raise exception 'transition % -> % should be refused', 'redeemed', 'cleared';
  end if;
  v_count := v_count + 1;
  if public.penalty_transition_allowed('redeemed', 'redeemed', 'debt') is distinct from false then
    raise exception 'transition % -> % should be refused', 'redeemed', 'redeemed';
  end if;

  raise notice 'debt and penalty rule parity: % vectors passed', v_count;
end;
$$;

do $$
declare
  v_count integer := 0;
  v_award record;
begin
  -- quest, uncapped, no modifiers: remainder to the first tag (G1)
  v_count := v_count + 1;
  select * into v_award from public.compute_award(
    'quest', 35, 150, '[{"stat":"STR","weight":1},{"stat":"VIT","weight":1}]'::jsonb,
    null, 0);
  if v_award.xp <> 35 or v_award.capped is distinct from false
     or v_award.stat_xp <> '{"STR":9,"AGI":0,"VIT":8,"INT":0,"SENSE":0}'::jsonb
     or v_award.weakened is distinct from false
     or v_award.repayment <> 0 then
    raise exception 'compute_award mismatch (%): got %', 'quest, uncapped, no modifiers: remainder to the first tag (G1)', v_award;
  end if;

  -- quest, capped: stat XP scaled by the cap ratio, no minimum (G2)
  v_count := v_count + 1;
  select * into v_award from public.compute_award(
    'quest', 35, 20, '[{"stat":"STR","weight":1},{"stat":"VIT","weight":1}]'::jsonb,
    null, 0);
  if v_award.xp <> 20 or v_award.capped is distinct from true
     or v_award.stat_xp <> '{"STR":5,"AGI":0,"VIT":4,"INT":0,"SENSE":0}'::jsonb
     or v_award.weakened is distinct from false
     or v_award.repayment <> 0 then
    raise exception 'compute_award mismatch (%): got %', 'quest, capped: stat XP scaled by the cap ratio, no minimum (G2)', v_award;
  end if;

  -- quest with Weakened on its only tag and debt open
  v_count := v_count + 1;
  select * into v_award from public.compute_award(
    'quest', 50, 150, '[{"stat":"VIT","weight":1}]'::jsonb,
    'VIT', 100);
  if v_award.xp <> 50 or v_award.capped is distinct from false
     or v_award.stat_xp <> '{"STR":0,"AGI":0,"VIT":0,"INT":0,"SENSE":0}'::jsonb
     or v_award.weakened is distinct from true
     or v_award.repayment <> 25 then
    raise exception 'compute_award mismatch (%): got %', 'quest with Weakened on its only tag and debt open', v_award;
  end if;

  -- quest repays only what is left
  v_count := v_count + 1;
  select * into v_award from public.compute_award(
    'quest', 10, 150, '[{"stat":"INT","weight":1},{"stat":"SENSE","weight":1}]'::jsonb,
    null, 3);
  if v_award.xp <> 10 or v_award.capped is distinct from false
     or v_award.stat_xp <> '{"STR":0,"AGI":0,"VIT":0,"INT":3,"SENSE":2}'::jsonb
     or v_award.weakened is distinct from false
     or v_award.repayment <> 3 then
    raise exception 'compute_award mismatch (%): got %', 'quest repays only what is left', v_award;
  end if;

  -- quest with no cap room left: a 0 XP event, nothing repaid
  v_count := v_count + 1;
  select * into v_award from public.compute_award(
    'quest', 20, 0, '[{"stat":"AGI","weight":1}]'::jsonb,
    null, 50);
  if v_award.xp <> 0 or v_award.capped is distinct from true
     or v_award.stat_xp <> '{"STR":0,"AGI":0,"VIT":0,"INT":0,"SENSE":0}'::jsonb
     or v_award.weakened is distinct from false
     or v_award.repayment <> 0 then
    raise exception 'compute_award mismatch (%): got %', 'quest with no cap room left: a 0 XP event, nothing repaid', v_award;
  end if;

  -- workout, capped, two stats weighted by sets, debt open
  v_count := v_count + 1;
  select * into v_award from public.compute_award(
    'workout', 16, 10, '[{"stat":"STR","weight":6},{"stat":"AGI","weight":2}]'::jsonb,
    null, 100);
  if v_award.xp <> 10 or v_award.capped is distinct from true
     or v_award.stat_xp <> '{"STR":4,"AGI":1,"VIT":0,"INT":0,"SENSE":0}'::jsonb
     or v_award.weakened is distinct from false
     or v_award.repayment <> 5 then
    raise exception 'compute_award mismatch (%): got %', 'workout, capped, two stats weighted by sets, debt open', v_award;
  end if;

  -- workout with Weakened on a stat it does not feed
  v_count := v_count + 1;
  select * into v_award from public.compute_award(
    'workout', 6, 150, '[{"stat":"VIT","weight":3}]'::jsonb,
    'STR', 0);
  if v_award.xp <> 6 or v_award.capped is distinct from false
     or v_award.stat_xp <> '{"STR":0,"AGI":0,"VIT":3,"INT":0,"SENSE":0}'::jsonb
     or v_award.weakened is distinct from false
     or v_award.repayment <> 0 then
    raise exception 'compute_award mismatch (%): got %', 'workout with Weakened on a stat it does not feed', v_award;
  end if;

  -- PR bonus ignores the cap and repays debt
  v_count := v_count + 1;
  select * into v_award from public.compute_award(
    'pr', 25, 0, '[{"stat":"STR","weight":1}]'::jsonb,
    null, 7);
  if v_award.xp <> 25 or v_award.capped is distinct from false
     or v_award.stat_xp <> '{"STR":10,"AGI":0,"VIT":0,"INT":0,"SENSE":0}'::jsonb
     or v_award.weakened is distinct from false
     or v_award.repayment <> 7 then
    raise exception 'compute_award mismatch (%): got %', 'PR bonus ignores the cap and repays debt', v_award;
  end if;

  -- PR bonus under Weakened STR
  v_count := v_count + 1;
  select * into v_award from public.compute_award(
    'pr', 25, 0, '[{"stat":"STR","weight":1}]'::jsonb,
    'STR', 0);
  if v_award.xp <> 25 or v_award.capped is distinct from false
     or v_award.stat_xp <> '{"STR":0,"AGI":0,"VIT":0,"INT":0,"SENSE":0}'::jsonb
     or v_award.weakened is distinct from true
     or v_award.repayment <> 0 then
    raise exception 'compute_award mismatch (%): got %', 'PR bonus under Weakened STR', v_award;
  end if;

  -- boss reward is cap-exempt and debt-exempt
  v_count := v_count + 1;
  select * into v_award from public.compute_award(
    'boss', 100, 0, '[{"stat":"STR","weight":1}]'::jsonb,
    null, 500);
  if v_award.xp <> 100 or v_award.capped is distinct from false
     or v_award.stat_xp <> '{"STR":50,"AGI":0,"VIT":0,"INT":0,"SENSE":0}'::jsonb
     or v_award.weakened is distinct from false
     or v_award.repayment <> 0 then
    raise exception 'compute_award mismatch (%): got %', 'boss reward is cap-exempt and debt-exempt', v_award;
  end if;

  -- trial reward is debt-exempt; Weakened zeroes only its stat
  v_count := v_count + 1;
  select * into v_award from public.compute_award(
    'trial', 20, 0, '[{"stat":"STR","weight":1},{"stat":"AGI","weight":1}]'::jsonb,
    'AGI', 40);
  if v_award.xp <> 20 or v_award.capped is distinct from false
     or v_award.stat_xp <> '{"STR":5,"AGI":0,"VIT":0,"INT":0,"SENSE":0}'::jsonb
     or v_award.weakened is distinct from true
     or v_award.repayment <> 0 then
    raise exception 'compute_award mismatch (%): got %', 'trial reward is debt-exempt; Weakened zeroes only its stat', v_award;
  end if;

  -- daily clear carries no stat XP and repays nothing
  v_count := v_count + 1;
  select * into v_award from public.compute_award(
    'daily_clear', 0, 0, '[]'::jsonb,
    'STR', 10);
  if v_award.xp <> 0 or v_award.capped is distinct from false
     or v_award.stat_xp <> '{"STR":0,"AGI":0,"VIT":0,"INT":0,"SENSE":0}'::jsonb
     or v_award.weakened is distinct from false
     or v_award.repayment <> 0 then
    raise exception 'compute_award mismatch (%): got %', 'daily clear carries no stat XP and repays nothing', v_award;
  end if;

  -- a big quest under a big debt: half goes to repayment
  v_count := v_count + 1;
  select * into v_award from public.compute_award(
    'quest', 75, 150, '[{"stat":"STR","weight":1}]'::jsonb,
    null, 1000);
  if v_award.xp <> 75 or v_award.capped is distinct from false
     or v_award.stat_xp <> '{"STR":37,"AGI":0,"VIT":0,"INT":0,"SENSE":0}'::jsonb
     or v_award.weakened is distinct from false
     or v_award.repayment <> 37 then
    raise exception 'compute_award mismatch (%): got %', 'a big quest under a big debt: half goes to repayment', v_award;
  end if;

  raise notice 'award pipeline parity: % vectors passed', v_count;
end;
$$;
