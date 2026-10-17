-- Monthly median price/sqft per community for sparklines (last 24 complete months).
select
    community_id,
    strftime(month, '%Y-%m') as month,
    count(psf)               as n,
    round(median(psf), 1)    as psf
from sales_clean
where community_id is not null
  and month >= getvariable('w24_start') and month < getvariable('w12_end')
group by all
order by community_id, month
