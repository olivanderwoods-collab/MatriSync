#pragma once
#include <stdint.h>
#include <stddef.h>
#include <string.h>
// Completeness only. The recipient app authenticates and decrypts the payload.
static bool completeHandoffFrame(const uint8_t *bytes, size_t size) {
  const char prefix[] = "MATRISYNC-HANDOFF/2\nLength:";
  const char footer[] = "\nEND-MATRISYNC-HANDOFF\n";
  if (size > 32768 || size < sizeof(prefix) + sizeof(footer) + 16 || memcmp(bytes, prefix, sizeof(prefix)-1)) return false;
  size_t pos = sizeof(prefix)-1, digits = 0; uint32_t length = 0;
  while (pos < size && bytes[pos] >= '0' && bytes[pos] <= '9' && digits < 5) { length = length*10 + bytes[pos++]-'0'; ++digits; }
  if (!digits || !length || pos+7+8+2 > size || memcmp(bytes+pos, "\nCRC32:", 7)) return false;
  pos += 7; uint32_t expected = 0;
  for (unsigned i=0;i<8;++i) { uint8_t c=bytes[pos++]; if (!((c>='0'&&c<='9')||(c>='a'&&c<='f'))) return false; expected=(expected<<4)|(c<='9'?c-'0':c-'a'+10); }
  if (bytes[pos++]!='\n' || bytes[pos++]!='\n') return false;
  if (pos+length+sizeof(footer)-1 != size || memcmp(bytes+pos+length, footer, sizeof(footer)-1)) return false;
  uint32_t crc=0xffffffff;
  for (size_t i=0;i<length;++i) { crc ^= bytes[pos+i]; for(unsigned bit=0;bit<8;++bit) crc=(crc>>1)^((crc&1)?0xedb88320:0); }
  return (crc ^ 0xffffffff) == expected;
}
