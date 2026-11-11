# IMDb poster sources

The application loads original film/TV poster images from IMDb's Amazon media CDN using exact IMDb title IDs. No AI-generated or substitute illustration assets are used.

`imdb-sources.json` records each IMDb title, public metadata source, original hosted URL, dimensions, and local fallback. Local files are copies of those exact IMDb images. Posters remain copyrighted by their respective rightsholders.

Refresh all eight demo-title poster references and local copies with `npm run posters:refresh`. This uses IMDb's public autocomplete feed at authoring time. It is not the subscription-based official IMDb GraphQL API, and the feed is not a guaranteed supported API. Runtime images load directly from `m.media-amazon.com`, falling back to the matching local poster if unavailable. No AWS credentials or private keys are embedded.
