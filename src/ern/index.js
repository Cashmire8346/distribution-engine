function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

export function generateErn(release) {
  const requiredFields = ['messageId', 'senderPartyId', 'senderName', 'title', 'artist', 'isrc', 'upc', 'duration']
  const missingFields = requiredFields.filter((field) => typeof release[field] !== 'string' || release[field].trim().length === 0)
  if (missingFields.length > 0) {
    throw new Error(`Cannot generate ERN: missing ${missingFields.join(', ')}`)
  }
  if (!Array.isArray(release.owners) || release.owners.length === 0) {
    throw new Error('Cannot generate ERN: ownership records are required')
  }

  const owners = release.owners.map((owner) => `      <PartyName><FullName>${escapeXml(owner.name)}</FullName><SharePercentage>${owner.share}</SharePercentage></PartyName>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<ern:NewReleaseMessage xmlns:ern="http://ddex.net/xml/ern/43" MessageSchemaVersionId="ern/43">
  <MessageHeader>
    <MessageThreadId>${escapeXml(release.messageId)}</MessageThreadId>
    <MessageId>${escapeXml(release.messageId)}</MessageId>
    <MessageSender><PartyId>${escapeXml(release.senderPartyId)}</PartyId><PartyName><FullName>${escapeXml(release.senderName)}</FullName></PartyName></MessageSender>
  </MessageHeader>
  <ResourceList>
    <SoundRecording>
      <SoundRecordingId><ISRC>${escapeXml(release.isrc)}</ISRC></SoundRecordingId>
      <ReferenceTitle><TitleText>${escapeXml(release.title)}</TitleText></ReferenceTitle>
      <Duration>${escapeXml(release.duration)}</Duration>
      <SoundRecordingDetailsByTerritory><TerritoryCode>Worldwide</TerritoryCode><DisplayArtist><PartyName><FullName>${escapeXml(release.artist)}</FullName></PartyName></DisplayArtist></SoundRecordingDetailsByTerritory>
    </SoundRecording>
  </ResourceList>
  <ReleaseList>
    <Release>
      <ReleaseId><ICPN>${escapeXml(release.upc)}</ICPN></ReleaseId>
      <ReferenceTitle><TitleText>${escapeXml(release.title)}</TitleText></ReferenceTitle>
      <ReleaseResourceReferenceList><ReleaseResourceReference ReleaseResourceType="PrimaryResource" ReleaseResourceReference="A1" /></ReleaseResourceReferenceList>
    </Release>
  </ReleaseList>
  <DealList><ReleaseDeal><DealReleaseReference>A1</DealReleaseReference><Deal><CommercialModelType>SubscriptionModel</CommercialModelType><UseType>OnDemandStream</UseType><TerritoryCode>Worldwide</TerritoryCode></Deal></ReleaseDeal></DealList>
  <PartyList>
${owners}
  </PartyList>
</ern:NewReleaseMessage>`
}

export function validateErnXml(xml) {
  const required = [
    '<ern:NewReleaseMessage',
    '<MessageHeader>',
    '<ResourceList>',
    '<ReleaseList>',
    '<DealList>',
    '<PartyList>'
  ]
  return required.every((marker) => xml.includes(marker)) && xml.includes('</ern:NewReleaseMessage>')
}
