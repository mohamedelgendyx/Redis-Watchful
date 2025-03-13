import { Hono } from 'hono';
import { raw } from "hono/html";
import { redisStatsUpdater } from './redis_updater.ts'
const app = new Hono()


export const RedisView = (props: { serverStats: string[][], groupStats: object[], streamStats: object[], alerts: object[], resolvedAlerts: object[]}) => {
    return (
        <html>
        <head>
            <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🎯</text></svg>" />
            <title>Watchful</title>
            <link rel="stylesheet" href="https://cdn.datatables.net/2.1.8/css/dataTables.dataTables.css" />
            <script src="https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js" integrity="sha512-v2CJ7UaYy4JwqLDIrZUI/4hqeoQieOmAZNXBeQyjo21dadnwR+8ZaIJVT8EE2iyI61OV8e6M8PP2/4hpQINQ/g==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
            <script src="https://cdn.datatables.net/2.1.8/js/dataTables.js"></script>
            

        </head>
        <body  style="width:80%">
            <h1>Redis Stats</h1>
            <h2>Alerts ⚠️</h2>

            <StatsObject data={props.alerts}></StatsObject>

            <h2>Resolved Alerts ✅</h2>

            <StatsObject data={props.resolvedAlerts}></StatsObject>

            <h2>Server Stats 🖥️</h2>
            
            <StatsTable headers={["Server Statistic", "Value"]} rows={props.serverStats}></StatsTable>
        
            <h2>Stream Stats 📢</h2>

            <StatsObject data={props.streamStats}></StatsObject>
            
            <h2>Group Stats 🔎</h2>
            <StatsObject data={props.groupStats}></StatsObject>



            <script type="text/javascript">
              {raw(`
              new DataTable("table", {
                paging: false,
                info: false,

              });
              `)}
            </script>
        </body>

        </html>
)
};

export const StatsObject = (props: { data: object[] }) => {
  if(Array.isArray(props.data) && props.data.length > 0) {
    return <StatsTable headers={ Object.keys(props.data[0]) } rows={props.data.map(r => Object.values(r))}></StatsTable>

  }
  else {
    return <p>no items found</p>
  }
}

export const StatsTable = (props: { headers: string[]; rows: string[][] }) => (
    <table className="stats-table display" style="width:80%">
      <thead>
        <tr>
          {props.headers.map((header) => (
            <th>{header}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {props.rows.map((row) => (
          <tr>
            {row.map((cell) => (
              <td>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );

    
app.get('/', async (c) => {
  await redisStatsUpdater.update();
  const redisStats = redisStatsUpdater.stats;
  
  return c.html(<RedisView serverStats={redisStats.server_info} streamStats={redisStats.streamStats} groupStats={redisStats.groupStats} alerts={redisStats.alerts} resolvedAlerts={redisStats.resolvedAlerts} />);
});

const port: number = parseInt(Deno.env.get("PORT") || "3000");

Deno.serve({ port: port }, app.fetch)
