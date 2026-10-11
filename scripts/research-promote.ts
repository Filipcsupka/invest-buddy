/** Research promotion stays an owner action through the DS1 command. */
export function researchPromoteCommand(symbol:string):string {
  if(!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) throw new Error("Expected an uppercase ticker");
  return `npm run discovery:promote -- ${symbol} --dry-run`;
}
if (/(?:^|[/\\])research-promote\.(?:ts|js)$/.test(process.argv[1]??"")) {
  const symbol=process.argv[2]?.toUpperCase()??"";
  process.stdout.write(researchPromoteCommand(symbol)+"\n");
}
