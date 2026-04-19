import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getProgressPageData } from "@/lib/db/queries";

// ── London calendar helpers (Europe/London = GMT in winter, BST UTC+1 in summer) ──

function londonDateStr(unixSec) {
  return new Date(unixSec * 1000).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
}

// Return the YYYY-MM-DD of the Monday starting the London calendar week for a unix timestamp
function londonWeekMonday(unixSec) {
  const dateStr = londonDateStr(unixSec);         // e.g. '2026-04-14'
  const d = new Date(dateStr + 'T00:00:00Z');     // parse as UTC to avoid host-tz noise
  const day = d.getUTCDay();                      // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().split('T')[0];
}

function londonThisMonday() {
  return londonWeekMonday(Math.floor(Date.now() / 1000));
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { knowledge, themesRows, intervalRows, activityDays, lifetimeStats } = await getProgressPageData(userId);

    // ── Knowledge map ─────────────────────────────────────────────────────────
    const allThemes = new Set();
    for (const row of themesRows) {
      if (row.themes) {
        row.themes.split(/[,\n;]+/).map(t => t.trim().toLowerCase()).filter(Boolean).forEach(t => allThemes.add(t));
      }
    }

    const knowledgeMap = {
      mastered:    Number(knowledge.mastered),
      progressing: Number(knowledge.progressing),
      new:         Number(knowledge.new_count),
      total:       Number(knowledge.total),
      docCount:    Number(knowledge.doc_count),
      topicCount:  allThemes.size,
    };

    // ── Interval trend (London calendar weeks) ────────────────────────────────
    const thisMondayStr = londonThisMonday();
    const thisMonday = new Date(thisMondayStr + 'T00:00:00Z');

    // weekStarts[0] = 7 weeks ago Monday, weekStarts[7] = this Monday
    const weekStarts = [];
    for (let i = 7; i >= 0; i--) {
      const m = new Date(thisMonday);
      m.setUTCDate(m.getUTCDate() - i * 7);
      weekStarts.push(m.toISOString().split('T')[0]);
    }

    // Bucket each review event by its London calendar week.
    // intervalRows has one row per review (not per question) → past weeks are immutable.
    const weekBuckets = {};
    for (const row of intervalRows) {
      if (row.interval_days == null) continue;
      const wk = londonWeekMonday(Number(row.answered_at));
      if (!weekBuckets[wk]) weekBuckets[wk] = [];
      weekBuckets[wk].push(Number(row.interval_days));
    }

    const weeks = weekStarts.map((weekStart, i) => {
      const weeksAgo = 7 - i;
      const label = weeksAgo === 0 ? 'This week' : `${weeksAgo}w ago`;
      const intervals = weekBuckets[weekStart];
      if (!intervals || intervals.length === 0) {
        return { weekStart, label, avgInterval: null, questionsReviewed: 0 };
      }
      const avg = intervals.reduce((s, v) => s + v, 0) / intervals.length;
      return {
        weekStart,
        label,
        avgInterval: Math.round(avg * 10) / 10,
        questionsReviewed: intervals.length,
      };
    });

    const weeksWithData = weeks.filter(w => w.avgInterval !== null);
    const lastTwo  = weeksWithData.slice(-2);
    const firstTwo = weeksWithData.slice(0, 2);

    const currentAvgInterval  = lastTwo.length  > 0
      ? Math.round(lastTwo.reduce((s, w) => s + w.avgInterval, 0) / lastTwo.length)
      : null;
    const startingAvgInterval = firstTwo.length > 0
      ? Math.round(firstTwo.reduce((s, w) => s + w.avgInterval, 0) / firstTwo.length)
      : null;

    const intervalTrend = {
      weeks,
      currentAvgInterval,
      startingAvgInterval,
      longTermCount: knowledgeMap.mastered,
      hasEnoughData: weeksWithData.length >= 2,
    };

    // ── Activity calendar (London dates, 49 days = 7 weeks) ───────────────────
    const calStart = new Date(thisMonday);
    calStart.setUTCDate(calStart.getUTCDate() - 6 * 7); // Monday 6 weeks ago

    // Aggregate raw answered_at timestamps into London calendar days
    const dayMap = {};
    for (const row of activityDays) {
      const day = londonDateStr(Number(row.answered_at));
      dayMap[day] = (dayMap[day] || 0) + 1;
    }

    const calDays = [];
    for (let i = 0; i < 49; i++) {
      const d = new Date(calStart);
      d.setUTCDate(d.getUTCDate() + i);
      const dateStr = d.toISOString().split('T')[0];
      calDays.push({ date: dateStr, count: dayMap[dateStr] || 0 });
    }

    return NextResponse.json({
      knowledgeMap,
      intervalTrend,
      activityCalendar: {
        days: calDays,
        totalSessions: Number(lifetimeStats.total_sessions),
        totalAnswers:   Number(lifetimeStats.total_answers),
        daysActive:     Number(lifetimeStats.days_active),
      },
      hasSessions: Number(lifetimeStats.total_sessions) > 0,
    });
  } catch (error) {
    console.error("[API] stats/progress failed:", error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
