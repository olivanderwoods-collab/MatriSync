import {expect,it} from "vitest";
import {medicationSchedule,medicationText} from "./care-medication";
it("only exposes an explicitly structured schedule and never interprets clinical prose",()=>{
 const value={name:"Synthetic copied medicine",dose:"",route:"",timing:"",from:"",until:""};
 expect(medicationSchedule(medicationText(value))).toEqual(value);
 expect(medicationSchedule("Confidential clinical narrative; dose not separately entered")).toBeUndefined();
 expect(medicationSchedule('MATRISYNC-MEDICATION-1\n{"name":"bad"}')).toBeUndefined();
 expect(()=>medicationText({...value,name:""})).toThrow();
});
