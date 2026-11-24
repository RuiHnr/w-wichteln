# W-Wichteln

A Secret Santa app for groups of friends: people join a group, the organizer draws who gives a present to whom, and each person sees only their own recipient.

Terms are English; the German word shown in the UI follows as _UI_.

## People

**Participant**:
A person who has joined a group under a name that is unique within that group.
_UI_: Teilnehmer
_Avoid_: Wichtel, member, user

**Organizer**:
A participant with extra rights over the group. The creator is the first; any organizer can grant or revoke the role, as long as one organizer remains.
_UI_: Organisator
_Avoid_: Admin, owner, host

**Giver**:
The participant who gives a present within an assignment.
_UI_: Schenkender ("Du beschenkst …")
_Avoid_: Wichtel, Santa

**Recipient**:
The participant who receives a present within an assignment.
_UI_: Beschenkter
_Avoid_: Wichtel, giftee, target

## Group

**Group**:
One Secret Santa round among a set of participants, with a budget and a gift-exchange date.
_UI_: Gruppe
_Avoid_: Event, room, party

**Exchange Date**:
The day the participants of a group hand over their presents.
_UI_: Datum der Bescherung
_Avoid_: Event date, deadline

**Invite Link**:
The shared link through which anyone can join a group while it is open.
_UI_: Einladungslink

**Personal Link**:
A link unique to one participant that restores their identity on any device.
_UI_: Persönlicher Link
_Avoid_: Login link, magic link

**Open**:
The phase of a group in which people can join and exclusions can be set.
_UI_: Anmeldung offen

**Drawn**:
The phase of a group after the draw, in which joining is closed and swaps are possible.
_UI_: Ausgelost

## Draw

**Draw**:
The single act by which the organizer creates all assignments of a group at once.
_UI_: Auslosung
_Avoid_: Shuffle, lottery, matching

**Assignment**:
One pairing of a giver to a recipient produced by a draw.
_UI_: Zuteilung
_Avoid_: Pair, match, Wichtel

**Exclusion**:
A rule set by the organizer that two participants must never be giver and recipient of each other, in either direction.
_UI_: Ausschluss
_Avoid_: Rule, constraint, block

**Reset**:
The organizer's act of discarding all assignments and returning a group to open.
_UI_: Zurücksetzen
_Avoid_: Redraw, undo

## Swap

**Swap**:
An exchange of recipients between two givers, after which each gives to the other's former recipient.
_UI_: Tausch
_Avoid_: Trade, switch

**Swap Request**:
A giver's proposal to another giver to perform a swap, which the other accepts or declines.
_UI_: Tauschanfrage

**Swap Limit**:
The maximum number of completed swaps each participant may take part in, set by the organizer; zero disables swapping.
_UI_: Tausch-Limit
_Avoid_: Swap quota, request limit

## Other

**Wishlist**:
Free text a participant writes about what they would like, visible only to their giver.
_UI_: Wunschzettel
_Avoid_: Wishes, gift list
