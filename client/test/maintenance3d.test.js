import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_PARTS, validateParts, getPartRepairs, partStatus } from "../src/components/maintenance3d/model.js";

test("template validates IDs, labels and bounded finite coordinates", () => {
  assert.ok(validateParts(DEFAULT_PARTS));
  assert.ok(validateParts([]));
  assert.equal(validateParts([...DEFAULT_PARTS,DEFAULT_PARTS[0]]),false);
  for (const patch of [{x:Infinity},{y:-1},{z:3},{label:" "}]) assert.equal(validateParts([{...DEFAULT_PARTS[0],...patch}]),false);
});
test("repair markers scope by bus; renaming a part retains its matching key", () => {
  const tickets = [{id:1,bus_id:1,status:"open",parts:[{part_name:"engine"}]},{id:2,bus_id:2,status:"open",parts:[{part_name:"Engine"}]}];
  assert.deepEqual(getPartRepairs({...DEFAULT_PARTS[0],label:"Rear engine"},tickets,"1").map(r=>r.id),[1]);
});
test("resolved work is not an active marker and long maintenance takes precedence", () => {
  assert.equal(partStatus([{status:"resolved"}]),"clear");
  assert.equal(partStatus([]),"clear");
  assert.equal(partStatus([{status:"in_progress"},{status:"open"},{status:"long_maintenance"}]),"long_maintenance");
});
