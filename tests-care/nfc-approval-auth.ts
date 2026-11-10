// Bundler alias ONLY in the isolated synthetic approval browser fixture.
export const fixtureAuth = {currentUser:null as null | {uid:string;isAnonymous:boolean}};
export async function accountAuth(){return fixtureAuth;}
