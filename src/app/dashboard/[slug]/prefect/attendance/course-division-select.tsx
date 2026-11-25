"use client";

import { useMemo, useState } from "react";

type Course = { id: string; name: string };
type Division = { id: string; name: string; course_id: string };

export default function CourseDivisionSelect({
  courses,
  divisions,
}: {
  courses: Course[];
  divisions: Division[];
}) {
  const [courseId, setCourseId] = useState("");
  const availableDivisions = useMemo(
    () => divisions.filter((division) => division.course_id === courseId),
    [courseId, divisions],
  );

  return (
    <>
      <label className="block text-sm font-medium">Curso
        <select name="course_id" required value={courseId} onChange={(event) => setCourseId(event.target.value)}
          className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm">
          <option value="">Seleccionar curso</option>
          {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
        </select>
      </label>
      <label className="block text-sm font-medium">División
        <select name="division_id" required disabled={!courseId} defaultValue=""
          className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm disabled:bg-slate-100">
          <option value="">Seleccionar división</option>
          {availableDivisions.map((division) =>
            <option key={division.id} value={division.id}>{division.name}</option>)}
        </select>
      </label>
    </>
  );
}
