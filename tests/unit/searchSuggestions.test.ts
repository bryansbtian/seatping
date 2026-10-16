import { describe, expect, it } from "vitest";
import { buildSearchSuggestionsQuery } from "../../server/lib/searchSuggestions.js";

describe("database suggestion query", () => {
  it("binds literal query values and caps candidates before loading images", () => {
    const value = "%_\\' OR true;";
    const query = buildSearchSuggestionsQuery(value, 3);
    expect(query.values).toContain(value);
    expect(query.values).toContain(3);
    expect(query.sql).not.toContain(value);
    expect(query.sql).toContain("strpos(");
    expect(query.sql).not.toContain("ILIKE");
    expect(query.sql.indexOf("LIMIT ?")).toBeLessThan(query.sql.indexOf("SELECT p.url"));
    expect(query.sql).toContain('l."isPublished" = true');
    expect(query.sql).toContain("IS DISTINCT FROM 'false'::jsonb");
  });
});
