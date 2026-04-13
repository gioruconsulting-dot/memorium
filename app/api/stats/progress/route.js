import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { getProgressPageData } from "@/lib/db/queries";

// Return the ISO date (YYYY-MM-DD) for the Monday of the week containing a unix timestamp
function weekMonday(unixSeconds) {
  const d = new Date(Number(unixSeconds) * 1000);
  const day = d.getUTCDay(); // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
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

    // ── Interval trend ────────────────────────────────────────────────────────
    // Compute the Monday of the current week and build 8 week slots
    const now = new Date();
    const todayDay = now.getUTCDay();
    const daysToMonday = todayDay === 0 ? 6 : todayDay - 1;
    const thisMonday = new Date(now);
    thisMonday.setUTCDate(thisMonday.getUTCDate() - daysToMonday);
    thisMonday.setUTCHours(0, 0, 0, 0);

    // weekStarts[0] = 7 weeks ago, weekStarts[7] = this week
    const weekStarts = [];
    for (let i = 7; i >= 0; i--) {
      const m = new Date(thisMonday);
      m.setUTCDate(m.getUTCDate() - i * 7);
      weekStarts.push(m.toISOString().split('T')[0]);
    }

    // Bucket each question's current interval into the week it was last reviewed
    const weekBuckets = {};
    for (const row of intervalRows) {
      const wk = weekMonday(Number(row.last_answered_at));
      if (!weekBuckets[wk]) weekBuckets[wk] = [];
      weekBuckets[wk].push(Number(row.current_interval_days));
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
      ? Math.round(lastTwo.reduce((s, w)  => s + w.avgInterval, 0) / lastTwo.length)
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

    // ── Activity calendar (63 days = 9 weeks) ─────────────────────────────────
    const calStart = new Date(thisMonday);
    calStart.setUTCDate(calStart.getUTCDate() - 8 * 7); // Monday 8 weeks ago

    const dayMap = {};
    for (const row of activityDays) {
      dayMap[row.day] = Number(row.count);
    }

    const calDays = [];
    for (let i = 0; i < 63; i++) {
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
